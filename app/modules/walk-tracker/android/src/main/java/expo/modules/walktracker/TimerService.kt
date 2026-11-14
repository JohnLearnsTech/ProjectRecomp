package expo.modules.walktracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import org.json.JSONObject

/**
 * Runs while a habit timer that isn't a walk is running (work, gaming, study...): keeps a live
 * notification with a ticking clock and redraws the Timer widget every second, so its dot-font
 * clock ticks like the walk one. The timer itself lives in the app; this only shows it.
 * Walks have their own service (WalkService), which does the same plus steps.
 */
class TimerService : Service() {
  companion object {
    private const val CHANNEL = "recomp_timer"
    private const val NOTIF_ID = 4243
    @Volatile var instance: TimerService? = null

    /** Run the service while `t` is a running timer and no walk is tracked; stop it otherwise. */
    fun sync(ctx: Context, t: JSONObject?) {
      val on = t != null && t.optBoolean("running") && !WalkStore(ctx).active
      val s = instance
      if (!on) { s?.halt(); return }
      if (s != null) { s.refresh(); return }
      val i = Intent(ctx, TimerService::class.java)
      try {
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
      } catch (e: Exception) { /* not allowed from the background right now; the widget still redraws on app updates */ }
    }
  }

  private val tick = Handler(Looper.getMainLooper())
  private val tickRun = object : Runnable {
    override fun run() {
      RecompWidgets.refresh(this@TimerService, listOf(TimerWidget::class.java))
      tick.postDelayed(this, 1000)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() { super.onCreate(); instance = this }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val t = RecompWidgets.timer(this)
    if (t == null || !t.optBoolean("running") || WalkStore(this).active) { halt(); return START_NOT_STICKY }
    try {
      val n = build(t)
      if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      else startForeground(NOTIF_ID, n)
    } catch (e: Exception) { stopSelf(); return START_NOT_STICKY }
    refresh()
    return START_STICKY
  }

  /** Match the notification and the ticking to the latest snapshot from the app. */
  fun refresh() {
    val t = RecompWidgets.timer(this)
    if (t == null || !t.optBoolean("running") || WalkStore(this).active) { halt(); return }
    (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_ID, build(t))
    tick.removeCallbacks(tickRun)
    tick.post(tickRun)
  }

  fun halt() {
    tick.removeCallbacks(tickRun)
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
    stopSelf()
    RecompWidgets.refresh(this, listOf(TimerWidget::class.java, HabitsWidget::class.java))
  }

  override fun onDestroy() {
    tick.removeCallbacks(tickRun)
    instance = null
    super.onDestroy()
  }

  private fun link(uri: String, code: Int): PendingIntent {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(this, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun build(t: JSONObject): Notification {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Timer running", NotificationManager.IMPORTANCE_LOW).apply {
        description = "A live clock while a habit timer runs"
        setShowBadge(false)
      })
    }
    val id = t.optString("id")
    val elapsed = t.optLong("elapsedMs") + (System.currentTimeMillis() - t.optLong("at"))
    val icon = resources.getIdentifier("notification_icon", "drawable", packageName).takeIf { it != 0 } ?: applicationInfo.icon
    val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this)
    b.setSmallIcon(icon)
      .setContentTitle(t.optString("name", "Timer"))
      .setContentText("Timer running")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_STOPWATCH)
      .setContentIntent(link("recomp:///?habit=${Uri.encode(id)}", 12))
      .addAction(Notification.Action.Builder(null as android.graphics.drawable.Icon?, "Pause", link("recomp:///?pause=${Uri.encode(id)}", 13)).build())
      .addAction(Notification.Action.Builder(null as android.graphics.drawable.Icon?, "Stop and save", link("recomp:///?stop=${Uri.encode(id)}", 14)).build())
      .setUsesChronometer(true).setWhen(System.currentTimeMillis() - elapsed).setShowWhen(true)
    if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    return b.build()
  }
}
