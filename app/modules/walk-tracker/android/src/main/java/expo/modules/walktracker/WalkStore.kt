package expo.modules.walktracker

import android.content.Context

/**
 * The walk being tracked, kept in SharedPreferences so the service, the JS module and a
 * restarted process all agree. Steps come from the phone's step counter, which counts since
 * boot: each running stretch remembers the counter at its start (base) and adds what it moved.
 */
class WalkStore(ctx: Context) {
  companion object {
    /** Your steps per sensor step, from calibration (1 until calibrated). */
    fun factor(ctx: Context) = ctx.applicationContext.getSharedPreferences("recomp_walk_cal", Context.MODE_PRIVATE).getFloat("factor", 1f)
    fun setFactor(ctx: Context, f: Float) { ctx.applicationContext.getSharedPreferences("recomp_walk_cal", Context.MODE_PRIVATE).edit().putFloat("factor", f).apply() }
  }
  private val appCtx = ctx.applicationContext
  private val p = ctx.applicationContext.getSharedPreferences("recomp_walk", Context.MODE_PRIVATE)

  val active get() = p.getBoolean("active", false)
  val running get() = p.getBoolean("running", false)
  val habitId: String get() = p.getString("habitId", "") ?: ""
  val name: String get() = p.getString("name", "Walk") ?: "Walk"
  private val segStart get() = p.getLong("segStart", 0L)
  private val accumMs get() = p.getLong("accumMs", 0L)
  private val stepsDone get() = p.getInt("stepsDone", 0)
  val base get() = p.getFloat("base", -1f)
  private val live get() = p.getInt("live", 0)

  /** Steps so far: raw sensor steps scaled by the calibration factor. */
  fun steps() = Math.round((stepsDone + live) * factor(appCtx))
  fun elapsed(now: Long) = accumMs + if (running) (now - segStart) else 0L

  fun begin(habitId: String, name: String, accumMs: Long, steps: Int, now: Long) {
    p.edit()
      .putBoolean("active", true).putBoolean("running", true)
      .putString("habitId", habitId).putString("name", name)
      .putLong("segStart", now).putLong("accumMs", accumMs)
      .putInt("stepsDone", steps).putInt("live", 0).putFloat("base", -1f).putInt("pending", 0).putBoolean("inRun", false)
      .putString("events", "")
      .apply()
  }

  /** A step-counter reading: the first in a stretch sets the base; after that, raw steps moved. */
  fun reading(value: Float, at: Long) {
    if (!running) return
    if (base < 0f) p.edit().putFloat("base", value).apply()
    else p.edit().putInt("live", (value - base).toInt().coerceAtLeast(0)).apply()
  }

  fun pause(now: Long, fromNotification: Boolean) {
    if (!active || !running) return
    p.edit()
      .putLong("accumMs", accumMs + (now - segStart))
      .putInt("stepsDone", stepsDone + live).putInt("live", 0).putFloat("base", -1f).putInt("pending", 0).putBoolean("inRun", false)
      .putBoolean("running", false)
      .apply()
    if (fromNotification) addEvent("p:$now")
  }

  fun resume(now: Long, fromNotification: Boolean) {
    if (!active || running) return
    p.edit().putBoolean("running", true).putLong("segStart", now).putInt("live", 0).putFloat("base", -1f).putInt("pending", 0).putBoolean("inRun", false).apply()
    if (fromNotification) addEvent("r:$now")
  }

  fun clear() { p.edit().clear().apply() }

  // Pauses and resumes tapped on the notification, for the app to replay on its own timer.
  private fun addEvent(e: String) {
    val cur = p.getString("events", "") ?: ""
    p.edit().putString("events", if (cur.isEmpty()) e else "$cur,$e").apply()
  }
  fun takeEvents(): List<String> {
    val cur = p.getString("events", "") ?: ""
    p.edit().putString("events", "").apply()
    return if (cur.isEmpty()) emptyList() else cur.split(",")
  }
}
