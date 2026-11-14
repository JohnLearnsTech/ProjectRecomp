package expo.modules.walktracker

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.NumberFormat
import java.time.LocalDate
import java.util.Calendar
import java.util.Locale

/**
 * The six home screen widgets, drawn natively in the Dot Matrix style. The app writes today's
 * numbers here (setWidgetData); the walk tracker adds live steps and time. A running timer is a
 * real Chronometer, so it ticks every second without the app.
 */
object RecompWidgets {
  private const val PREFS = "recomp_widgets"
  private const val RED = "#FF2A1C"
  private const val GREY = "#8C8C8C"

  fun save(ctx: Context, json: String) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("data", json).apply()
    refresh(ctx, null)
  }
  private fun load(ctx: Context): JSONObject? = try {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", null)?.let { JSONObject(it) }
  } catch (e: Exception) { null }

  /** Redraw every placed widget, or only those of the given providers. */
  fun refresh(ctx: Context, only: List<Class<out AppWidgetProvider>>?) {
    val mgr = AppWidgetManager.getInstance(ctx)
    val all: List<Class<out AppWidgetProvider>> = listOf(StepsWidget::class.java, FoodWidget::class.java, LiftWidget::class.java, LevelWidget::class.java, TimerWidget::class.java, HabitsWidget::class.java)
    for (cls in only ?: all) {
      val ids = try { mgr.getAppWidgetIds(ComponentName(ctx, cls)) } catch (e: Exception) { IntArray(0) }
      for (id in ids) draw(ctx, mgr, cls, id)
    }
  }

  fun draw(ctx: Context, mgr: AppWidgetManager, cls: Class<out AppWidgetProvider>, id: Int) {
    val d = load(ctx)
    val views = try {
      when (cls) {
        StepsWidget::class.java -> steps(ctx, d)
        FoodWidget::class.java -> food(ctx, d)
        LiftWidget::class.java -> lift(ctx, d)
        LevelWidget::class.java -> level(ctx, d)
        TimerWidget::class.java -> timer(ctx, d)
        else -> habits(ctx, d)
      }
    } catch (e: Exception) { stale(ctx, "Recomp") }
    mgr.updateAppWidget(id, views)
  }

  // ── helpers ──
  private val fmt get() = NumberFormat.getIntegerInstance(Locale("en", "IN"))
  private fun n(x: Int) = fmt.format(x)
  private fun fresh(d: JSONObject?) = d != null && d.optString("day") == LocalDate.now().toString()

  private fun link(ctx: Context, uri: String): PendingIntent {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(ctx, uri.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  private fun walkAction(ctx: Context, action: String): PendingIntent {
    val i = Intent(ctx, WalkService::class.java).setAction(action)
    return PendingIntent.getService(ctx, action.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  private fun label(v: RemoteViews, left: String, right: String? = null, leftRed: Boolean = false, rightRed: Boolean = false) {
    v.setTextViewText(R.id.lbl_l, left)
    v.setTextColor(R.id.lbl_l, Color.parseColor(if (leftRed) RED else GREY))
    v.setTextViewText(R.id.lbl_r, right ?: "")
    v.setTextColor(R.id.lbl_r, Color.parseColor(if (rightRed) RED else GREY))
  }
  private fun stale(ctx: Context, name: String): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.w_stale)
    label(v, name)
    v.setOnClickPendingIntent(R.id.root, link(ctx, "recomp:///"))
    return v
  }
  /** The tracked walk, when there is one: its habit, steps, time and whether it's moving. */
  private data class Walk(val habitId: String, val steps: Int, val elapsed: Long, val running: Boolean)
  private fun walk(ctx: Context): Walk? {
    val s = WalkStore(ctx)
    return if (s.active) Walk(s.habitId, s.steps(), s.elapsed(System.currentTimeMillis()), s.running) else null
  }

  // ── Steps ──
  private fun steps(ctx: Context, d: JSONObject?): RemoteViews {
    if (!fresh(d)) return stale(ctx, "Steps")
    val w = walk(ctx)
    val total = d!!.optInt("steps") + (w?.steps ?: 0)
    val target = d.optInt("stepsTarget", 1).coerceAtLeast(1)
    val v = RemoteViews(ctx.packageName, R.layout.w_steps)
    val left = when { w == null -> "Steps"; w.running -> "● Live"; else -> "❚❚ Paused" }
    label(v, left, if (total >= target) "✓ Target" else "${total * 100 / target}%", leftRed = w?.running == true)
    v.setTextViewText(R.id.big, n(total))
    v.setOnClickPendingIntent(R.id.root, link(ctx, "recomp:///"))
    return v
  }

  // ── Food ──
  private fun food(ctx: Context, d: JSONObject?): RemoteViews {
    if (!fresh(d)) return stale(ctx, "Food")
    val left = d!!.optInt("kcalLeft"); val over = left < 0; val p = d.optInt("proteinLeft")
    val v = RemoteViews(ctx.packageName, R.layout.w_food)
    label(v, "Food", if (over) "kcal over" else "kcal left", rightRed = over)
    v.setTextViewText(R.id.big, n(Math.abs(left)))
    v.setTextColor(R.id.big, Color.parseColor(if (over) RED else "#FFFFFF"))
    v.setTextViewText(R.id.sub, if (p > 0) "${n(p)} g protein to go" else "Protein done ✓")
    v.setOnClickPendingIntent(R.id.root, link(ctx, "recomp:///food"))
    v.setOnClickPendingIntent(R.id.add, link(ctx, "recomp:///food?focus=1"))
    return v
  }

  // ── Lift ──
  private fun lift(ctx: Context, d: JSONObject?): RemoteViews {
    if (!fresh(d)) return stale(ctx, "Lift")
    val state = d!!.optString("lift"); val done = state == "done" || state == "warm"; val todo = state == "todo"
    val v = RemoteViews(ctx.packageName, R.layout.w_lift)
    val head = when { todo || done -> "Lift"; state == "rest" -> "Rest day"; state == "cardio" -> "Cardio day"; else -> "Train" }
    label(v, head, if (todo) "●" else if (done) "✓" else null, rightRed = todo)
    v.setTextViewText(R.id.line, if (done) "Done. That counts." else d.optString("liftLine").ifEmpty { "Nothing planned" }.removePrefix("Lift "))
    v.setViewVisibility(R.id.go, if (todo) View.VISIBLE else View.GONE)
    v.setOnClickPendingIntent(R.id.go, link(ctx, "recomp:///session?short=1"))
    v.setOnClickPendingIntent(R.id.root, link(ctx, "recomp:///train"))
    return v
  }

  // ── Level ──
  private val PIPS = intArrayOf(R.id.p0, R.id.p1, R.id.p2, R.id.p3, R.id.p4, R.id.p5, R.id.p6, R.id.p7, R.id.p8, R.id.p9,
    R.id.p10, R.id.p11, R.id.p12, R.id.p13, R.id.p14, R.id.p15, R.id.p16, R.id.p17, R.id.p18, R.id.p19)
  private fun level(ctx: Context, d: JSONObject?): RemoteViews {
    val r = d?.optJSONObject("rank") ?: return stale(ctx, "Level")
    val v = RemoteViews(ctx.packageName, R.layout.w_level)
    val streak = d.optInt("streak")
    label(v, "Level ${r.optInt("i") + 1}", if (streak > 0) "● $streak" else null, rightRed = true)
    v.setTextViewText(R.id.name, r.optString("name"))
    val span = r.optInt("span", 1).coerceIn(1, PIPS.size); val on = r.optInt("done", 0)
    PIPS.forEachIndexed { i, id ->
      v.setViewVisibility(id, if (i < span) View.VISIBLE else View.GONE)
      v.setInt(id, "setBackgroundResource", if (i < on) R.drawable.w_pip_on else R.drawable.w_pip_off)
    }
    val next = r.optString("next", ""); val need = r.optInt("need")
    v.setTextViewText(R.id.sub, if (next.isNotEmpty() && next != "null") "$need day${if (need == 1) "" else "s"} to $next" else "Top rank. Keep it.")
    v.setOnClickPendingIntent(R.id.root, link(ctx, "recomp:///"))
    return v
  }

  // ── Timer ──
  private val STARTS = intArrayOf(R.id.s0, R.id.s1, R.id.s2)
  private fun clock(ms: Long): String {
    val c = Calendar.getInstance().apply { timeInMillis = ms }
    val h = c.get(Calendar.HOUR_OF_DAY); val m = c.get(Calendar.MINUTE)
    return "${(h + 11) % 12 + 1}:${m.toString().padStart(2, '0')} ${if (h < 12) "am" else "pm"}"
  }
  private fun timer(ctx: Context, d: JSONObject?): RemoteViews {
    val t = d?.optJSONObject("timer")
    val w = walk(ctx)
    if (t == null && w == null) {
      val v = RemoteViews(ctx.packageName, R.layout.w_timer_idle)
      label(v, "Habit timer", "Ready")
      val timed = mutableListOf<JSONObject>()
      val hs = d?.optJSONArray("habits")
      if (hs != null) for (i in 0 until hs.length()) { val h = hs.getJSONObject(i); if (h.optBoolean("timed")) timed.add(h) }
      STARTS.forEachIndexed { i, id ->
        if (i < timed.size) {
          v.setViewVisibility(id, View.VISIBLE)
          v.setTextViewText(id, "▶ " + timed[i].optString("name"))
          v.setOnClickPendingIntent(id, link(ctx, "recomp:///?start=" + Uri.encode(timed[i].optString("id"))))
        } else v.setViewVisibility(id, View.GONE)
      }
      v.setViewVisibility(R.id.none, if (timed.isEmpty()) View.VISIBLE else View.GONE)
      v.setOnClickPendingIntent(R.id.root, link(ctx, "recomp:///"))
      return v
    }
    // The walk tracker knows best about a walk; otherwise the app's timer as last written.
    val id = w?.habitId ?: t!!.optString("id")
    val isWalk = w != null && w.habitId == id
    val running = if (isWalk) w!!.running else t!!.optBoolean("running")
    val elapsed = if (isWalk) w!!.elapsed else t!!.optLong("elapsedMs") + if (running) System.currentTimeMillis() - t.optLong("at") else 0L
    val name = if (t != null && t.optString("id") == id) t.optString("name") else d?.optJSONObject("names")?.optString(id)?.ifEmpty { null } ?: "Walk"
    val since = t?.optLong("since", 0L) ?: 0L
    val v = RemoteViews(ctx.packageName, R.layout.w_timer)
    label(v, (if (running) "● " else "❚❚ ") + name, if (!running) "paused" else if (since > 0) "since ${clock(since)}" else null, leftRed = running)
    v.setChronometer(R.id.clock, SystemClock.elapsedRealtime() - elapsed, null, running)
    v.setTextViewText(R.id.sub, if (isWalk) "${n(w!!.steps)} steps" else "")
    v.setTextViewText(R.id.toggle, if (running) "Pause" else "Resume")
    v.setOnClickPendingIntent(R.id.toggle,
      if (isWalk) walkAction(ctx, if (running) WalkService.ACTION_PAUSE else WalkService.ACTION_RESUME)
      else link(ctx, (if (running) "recomp:///?pause=" else "recomp:///?start=") + Uri.encode(id)))
    v.setOnClickPendingIntent(R.id.stop, link(ctx, "recomp:///?stop=" + Uri.encode(id)))
    v.setOnClickPendingIntent(R.id.root, link(ctx, "recomp:///?habit=" + Uri.encode(id)))
    return v
  }

  // ── Habits ──
  private val TILES = arrayOf(intArrayOf(R.id.h0, R.id.h0n, R.id.h0v), intArrayOf(R.id.h1, R.id.h1n, R.id.h1v), intArrayOf(R.id.h2, R.id.h2n, R.id.h2v),
    intArrayOf(R.id.h3, R.id.h3n, R.id.h3v), intArrayOf(R.id.h4, R.id.h4n, R.id.h4v), intArrayOf(R.id.h5, R.id.h5n, R.id.h5v))
  private fun habits(ctx: Context, d: JSONObject?): RemoteViews {
    if (!fresh(d)) return stale(ctx, "Habits")
    val hs = d!!.optJSONArray("habits")
    val count = hs?.length()?.coerceAtMost(6) ?: 0
    val runningId = walk(ctx)?.takeIf { it.running }?.habitId ?: d.optJSONObject("timer")?.takeIf { it.optBoolean("running") }?.optString("id")
    val v = RemoteViews(ctx.packageName, R.layout.w_habits)
    var met = 0
    for (i in 0 until count) if (hs!!.getJSONObject(i).optBoolean("met")) met++
    label(v, "Habits", if (count > 0) "$met / $count" else null)
    TILES.forEachIndexed { i, (box, nameId, valId) ->
      if (i >= count) { v.setViewVisibility(box, View.INVISIBLE); return@forEachIndexed }
      val h = hs!!.getJSONObject(i)
      val on = h.optString("id") == runningId; val ok = h.optBoolean("met")
      v.setViewVisibility(box, View.VISIBLE)
      v.setInt(box, "setBackgroundResource", when { on -> R.drawable.w_tile_on; ok -> R.drawable.w_tile_done; else -> R.drawable.w_tile })
      v.setTextViewText(nameId, (if (ok) "✓ " else if (on) "● " else "") + h.optString("name"))
      v.setTextColor(nameId, Color.parseColor(if (on) RED else "#FFFFFF"))
      v.setTextViewText(valId, if (on) "running" else h.optString("val"))
      val hid = Uri.encode(h.optString("id"))
      v.setOnClickPendingIntent(box, link(ctx, if (h.optBoolean("timed") && !on) "recomp:///?start=$hid" else "recomp:///?habit=$hid"))
    }
    v.setViewVisibility(R.id.row0, if (count > 0) View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.row1, if (count > 3) View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.none, if (count == 0) View.VISIBLE else View.GONE)
    v.setOnClickPendingIntent(R.id.root, link(ctx, "recomp:///"))
    return v
  }
}

/** One provider per widget; all of them draw through RecompWidgets. */
abstract class RecompWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) RecompWidgets.draw(context, appWidgetManager, this::class.java, id)
  }
}
class StepsWidget : RecompWidget()
class FoodWidget : RecompWidget()
class LiftWidget : RecompWidget()
class LevelWidget : RecompWidget()
class TimerWidget : RecompWidget()
class HabitsWidget : RecompWidget()
