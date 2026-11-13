package expo.modules.walktracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import java.text.NumberFormat
import java.util.Locale

/**
 * Runs only while a walk timer runs: counts steps from the phone's step counter, keeps a live
 * notification (a ticking timer, the steps, Pause/Resume and Stop) and nudges the Steps and
 * Timer widgets to redraw every so often. Stopping and logging happen in the app.
 */
class WalkService : Service(), SensorEventListener {
  companion object {
    const val ACTION_PAUSE = "recomp.walk.PAUSE"
    const val ACTION_RESUME = "recomp.walk.RESUME"
    private const val CHANNEL = "recomp_walk"
    private const val NOTIF_ID = 4242
    @Volatile var instance: WalkService? = null

    /** Starts the service, or brings a running one in line with the store. */
    fun sync(ctx: Context) {
      val s = instance
      if (s != null) { s.refresh(); return }
      if (!WalkStore(ctx).active) return
      val i = Intent(ctx, WalkService::class.java)
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
    }
  }

  private var sensors: SensorManager? = null
  private var listening = false
  private var lastNotif = 0L
  private var lastWidget = 0L

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    sensors = getSystemService(Context.SENSOR_SERVICE) as SensorManager?
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val store = WalkStore(this)
    val now = System.currentTimeMillis()
    when (intent?.action) {
      ACTION_PAUSE -> store.pause(now, true)
      ACTION_RESUME -> store.resume(now, true)
    }
    if (!store.active) { stopSelf(); return START_NOT_STICKY }
    try {
      val n = build(store)
      if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
      else startForeground(NOTIF_ID, n)
    } catch (e: Exception) {
      // Not allowed right now (permission missing, or started from the background): give up quietly.
      stopSelf(); return START_NOT_STICKY
    }
    refresh()
    return START_STICKY
  }

  /** Match the sensor, notification and widgets to the store. */
  fun refresh() {
    val store = WalkStore(this)
    if (!store.active) { stopListening(); stopForegroundCompat(); stopSelf(); return }
    if (store.running) startListening() else stopListening()
    notifyNow(store)
    widgets(true)
  }

  private fun startListening() {
    if (listening) return
    val sensor = sensors?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return
    listening = sensors?.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL) == true
  }
  private fun stopListening() {
    if (!listening) return
    sensors?.unregisterListener(this)
    listening = false
  }

  override fun onSensorChanged(event: SensorEvent) {
    val store = WalkStore(this)
    store.reading(event.values[0])
    val now = System.currentTimeMillis()
    if (now - lastNotif > 2000) notifyNow(store)
    widgets(false)
  }
  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

  override fun onDestroy() {
    stopListening()
    instance = null
    super.onDestroy()
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
  }

  private fun notifyNow(store: WalkStore) {
    lastNotif = System.currentTimeMillis()
    (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_ID, build(store))
  }

  /** The Steps and Timer widgets redraw through their own update; at most every 15 seconds. */
  private fun widgets(force: Boolean) {
    val now = System.currentTimeMillis()
    if (!force && now - lastWidget < 15000) return
    lastWidget = now
    val mgr = AppWidgetManager.getInstance(this)
    for (name in listOf("Steps", "Timer")) {
      val cn = ComponentName(packageName, "$packageName.widget.$name")
      val ids = try { mgr.getAppWidgetIds(cn) } catch (e: Exception) { IntArray(0) }
      if (ids.isEmpty()) continue
      sendBroadcast(Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).setComponent(cn).putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids))
    }
  }

  private fun link(uri: String, code: Int): PendingIntent {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(this, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun build(store: WalkStore): Notification {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Walk in progress", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Live time and steps while your walk timer runs"
        setShowBadge(false)
      })
    }
    val now = System.currentTimeMillis()
    val elapsed = store.elapsed(now)
    val hasSensor = sensors?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
    val steps = NumberFormat.getIntegerInstance(Locale("en", "IN")).format(store.steps())
    val title = if (store.running) "${store.name} · $steps steps" else "${store.name} paused · $steps steps"
    val text = when {
      !hasSensor -> "This phone has no step counter, so only time is tracked."
      store.running -> "Counting while your timer runs"
      else -> "${elapsed / 60000} min so far. Resume when you're moving again."
    }
    val toggle = Intent(this, WalkService::class.java).setAction(if (store.running) ACTION_PAUSE else ACTION_RESUME)
    val togglePi = PendingIntent.getService(this, 1, toggle, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val icon = resources.getIdentifier("notification_icon", "drawable", packageName).takeIf { it != 0 } ?: applicationInfo.icon
    val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this)
    b.setSmallIcon(icon)
      .setContentTitle(title)
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_WORKOUT)
      .setContentIntent(link("recomp:///?habit=${Uri.encode(store.habitId)}", 2))
      .addAction(Notification.Action.Builder(null as android.graphics.drawable.Icon?, if (store.running) "Pause" else "Resume", togglePi).build())
      .addAction(Notification.Action.Builder(null as android.graphics.drawable.Icon?, "Stop and save", link("recomp:///?stop=${Uri.encode(store.habitId)}", 3)).build())
    if (store.running) b.setUsesChronometer(true).setWhen(now - elapsed).setShowWhen(true)
    else b.setUsesChronometer(false).setShowWhen(false)
    if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    return b.build()
  }
}
