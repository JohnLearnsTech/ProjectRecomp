package expo.modules.walktracker

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.NumberFormat
import java.time.LocalDate
import java.util.Calendar
import java.util.Locale
import kotlin.math.ceil

/**
 * The six home screen widgets, drawn natively in the Dot Matrix style. Android widgets can't
 * use an app's own fonts in text views, so every piece of text is drawn here as an image in the
 * bundled Doto (numbers) and Space Grotesk (labels) fonts, sized to the space the launcher gives
 * the widget. The app writes today's numbers here (setWidgetData); the walk tracker adds live
 * steps and time, and redraws the walk clock every second while it runs.
 */
object RecompWidgets {
  private const val PREFS = "recomp_widgets"
  private val WHITE = Color.WHITE
  private val GREY = Color.parseColor("#8C8C8C")
  private val RED = Color.parseColor("#FF2A1C")
  private val BLACK = Color.BLACK

  fun save(ctx: Context, json: String) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("data", json).apply()
    refresh(ctx, null)
  }
  private fun load(ctx: Context): JSONObject? = try {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", null)?.let { JSONObject(it) }
  } catch (e: Exception) { null }

  private val ALL: List<Class<out AppWidgetProvider>> = listOf(StepsWidget::class.java, FoodWidget::class.java, LiftWidget::class.java, LevelWidget::class.java, TimerWidget::class.java, HabitsWidget::class.java)

  /** Redraw every placed widget, or only those of the given providers. */
  fun refresh(ctx: Context, only: List<Class<out AppWidgetProvider>>?) {
    val mgr = AppWidgetManager.getInstance(ctx)
    for (cls in only ?: ALL) {
      val ids = try { mgr.getAppWidgetIds(ComponentName(ctx, cls)) } catch (e: Exception) { IntArray(0) }
      for (id in ids) draw(ctx, mgr, cls, id)
    }
  }

  /** The space this widget has, in dp: width and height as the launcher reports them. */
  private class Box(val ctx: Context, opts: Bundle?, defW: Int, defH: Int, baseH: Int) {
    val density = ctx.resources.displayMetrics.density
    val wDp = (opts?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) ?: 0).takeIf { it > 0 } ?: defW
    val hDp = (opts?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) ?: 0).takeIf { it > 0 } ?: defH
    /** How much bigger than the design size the content is drawn: grows with the widget. */
    val k = (hDp.toFloat() / baseH).coerceIn(0.7f, 1.7f)
    /** Usable width in px, inside the 16 dp side padding. */
    val inner = ((wDp - 32) * density).toInt().coerceAtLeast(40)
    fun px(dp: Float) = dp * density
  }

  fun draw(ctx: Context, mgr: AppWidgetManager, cls: Class<out AppWidgetProvider>, id: Int) {
    val d = load(ctx)
    val opts = try { mgr.getAppWidgetOptions(id) } catch (e: Exception) { null }
    val views = try {
      when (cls) {
        StepsWidget::class.java -> steps(Box(ctx, opts, 130, 57, 72), d)
        FoodWidget::class.java -> food(Box(ctx, opts, 130, 130, 140), d)
        LiftWidget::class.java -> lift(Box(ctx, opts, 130, 57, 72), d)
        LevelWidget::class.java -> level(Box(ctx, opts, 130, 130, 140), d)
        TimerWidget::class.java -> timer(Box(ctx, opts, 300, 57, 80), d)
        else -> habits(Box(ctx, opts, 300, 130, 140), d)
      }
    } catch (e: Exception) { stale(Box(ctx, opts, 130, 57, 72), "Recomp") }
    mgr.updateAppWidget(id, views)
  }

  // ── drawing text as images ──
  private val fonts = HashMap<Int, Typeface>()
  private fun font(ctx: Context, res: Int): Typeface = fonts.getOrPut(res) { try { ctx.resources.getFont(res) } catch (e: Exception) { Typeface.DEFAULT_BOLD } }
  private fun paint(b: Box, res: Int, sp: Float, color: Int, spacing: Float) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = font(b.ctx, res); textSize = sp * b.density * b.ctx.resources.configuration.fontScale.coerceIn(0.85f, 1.3f); this.color = color; letterSpacing = spacing
  }

  /** One line of text as an image, shrunk (to 75%) then cut short with … to fit maxPx. */
  private fun line(b: Box, s: String, res: Int, sp: Float, color: Int, maxPx: Int = b.inner, spacing: Float = 0f): Bitmap {
    val p = paint(b, res, sp, color, spacing)
    val start = p.textSize
    while (p.measureText(s) > maxPx && p.textSize > start * 0.75f) p.textSize -= 1f
    var t = s
    while (p.measureText(t) > maxPx && t.length > 1) t = t.dropLast(2) + "…"
    val fm = p.fontMetrics
    val w = ceil(p.measureText(t)).toInt().coerceAtLeast(1) + 2
    val h = ceil(fm.descent - fm.ascent).toInt().coerceAtLeast(1)
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    Canvas(bmp).drawText(t, 0f, -fm.ascent, p)
    return bmp
  }
  /** Wrapped text, up to maxLines, as an image. */
  private fun block(b: Box, s: String, res: Int, sp: Float, color: Int, maxPx: Int, maxLines: Int): Bitmap {
    val p = paint(b, res, sp, color, 0f)
    val sl = StaticLayout.Builder.obtain(s, 0, s.length, p, maxPx.coerceAtLeast(10)).setMaxLines(maxLines).setEllipsize(TextUtils.TruncateAt.END)
      .setAlignment(Layout.Alignment.ALIGN_NORMAL).setIncludePad(false).build()
    var w = 1f
    for (i in 0 until sl.lineCount) w = maxOf(w, sl.getLineWidth(i))
    val bmp = Bitmap.createBitmap(ceil(w).toInt() + 2, sl.height.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
    sl.draw(Canvas(bmp))
    return bmp
  }
  /** A pill button: white filled with black text, or a white outline. */
  private fun pill(b: Box, s: String, filled: Boolean, sp: Float = 11f): Bitmap {
    val p = paint(b, R.font.space_grotesk_bold, maxOf(9f, sp * b.k.coerceAtMost(1.35f)), if (filled) BLACK else WHITE, 0.06f)
    val t = s.uppercase(Locale.ROOT)
    val fm = p.fontMetrics
    val padH = b.px(11f * b.k.coerceIn(0.8f, 1.2f)); val padV = b.px(4f * b.k.coerceIn(0.8f, 1.2f)); val stroke = b.px(1.5f)
    val w = ceil(p.measureText(t) + padH * 2).toInt(); val h = ceil(fm.descent - fm.ascent + padV * 2).toInt()
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val r = RectF(stroke / 2, stroke / 2, w - stroke / 2, h - stroke / 2)
    val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = WHITE; style = if (filled) Paint.Style.FILL else Paint.Style.STROKE; strokeWidth = stroke }
    c.drawRoundRect(r, h / 2f, h / 2f, bg)
    c.drawText(t, padH, padV - fm.ascent, p)
    return bmp
  }
  private fun set(v: RemoteViews, id: Int, bmp: Bitmap?) {
    if (bmp == null) { v.setViewVisibility(id, View.GONE); return }
    v.setViewVisibility(id, View.VISIBLE); v.setImageViewBitmap(id, bmp)
  }
  /** The caps label row: grey small caps, red where it needs you. */
  private fun label(b: Box, v: RemoteViews, left: String, right: String? = null, leftRed: Boolean = false, rightRed: Boolean = false) {
    val sp = maxOf(8.5f, 10f * b.k.coerceAtMost(1.3f))
    val r = right?.takeIf { it.isNotEmpty() }?.let { line(b, it.uppercase(Locale.ROOT), R.font.space_grotesk_medium, sp, if (rightRed) RED else GREY, b.inner / 2, 0.14f) }
    set(v, R.id.lbl_r, r)
    set(v, R.id.lbl_l, line(b, left.uppercase(Locale.ROOT), R.font.space_grotesk_medium, sp, if (leftRed) RED else GREY, b.inner - (r?.width ?: 0) - b.px(8f).toInt(), 0.14f))
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
  private data class Walk(val habitId: String, val steps: Int, val elapsed: Long, val running: Boolean)
  private fun walk(ctx: Context): Walk? {
    val s = WalkStore(ctx)
    return if (s.active) Walk(s.habitId, s.steps(), s.elapsed(System.currentTimeMillis()), s.running) else null
  }
  /** Which habit timer is running now: the walk tracker knows a walk best, else the app's timer. */
  private fun runningId(ctx: Context, d: JSONObject?): String? {
    val w = walk(ctx)
    val t = d?.optJSONObject("timer")
    if (w != null) return if (w.running) w.habitId else t?.takeIf { it.optBoolean("running") && it.optString("id") != w.habitId }?.optString("id")
    return t?.takeIf { it.optBoolean("running") }?.optString("id")
  }

  private fun stale(b: Box, name: String): RemoteViews {
    val v = RemoteViews(b.ctx.packageName, R.layout.w_stale)
    label(b, v, name)
    set(v, R.id.msg, line(b, "Tap to load today", R.font.space_grotesk_bold, 13f * b.k, WHITE))
    v.setOnClickPendingIntent(R.id.root, link(b.ctx, "recomp:///"))
    return v
  }

  // ── Steps ──
  private fun steps(b: Box, d: JSONObject?): RemoteViews {
    if (!fresh(d)) return stale(b, "Steps")
    val w = walk(b.ctx)
    val total = d!!.optInt("steps") + (w?.steps ?: 0)
    val target = d.optInt("stepsTarget", 1).coerceAtLeast(1)
    val v = RemoteViews(b.ctx.packageName, R.layout.w_steps)
    label(b, v, when { w == null -> "Steps"; w.running -> "● Live"; else -> "❚❚ Paused" }, if (total >= target) "✓ Target" else "${total * 100 / target}%", leftRed = w?.running == true)
    set(v, R.id.big, line(b, n(total), R.font.doto_black, 28f * b.k, WHITE))
    v.setOnClickPendingIntent(R.id.root, link(b.ctx, "recomp:///"))
    return v
  }

  // ── Food ──
  private fun food(b: Box, d: JSONObject?): RemoteViews {
    if (!fresh(d)) return stale(b, "Food")
    val left = d!!.optInt("kcalLeft"); val over = left < 0; val p = d.optInt("proteinLeft")
    val v = RemoteViews(b.ctx.packageName, R.layout.w_food)
    label(b, v, "Food", if (over) "kcal over" else "kcal left", rightRed = over)
    set(v, R.id.big, line(b, n(Math.abs(left)), R.font.doto_black, 36f * b.k, if (over) RED else WHITE))
    set(v, R.id.sub, line(b, if (p > 0) "${n(p)} g protein to go" else "Protein done ✓", R.font.space_grotesk_medium, 11f * b.k.coerceAtMost(1.3f), GREY))
    set(v, R.id.add, pill(b, "+ Add", true))
    v.setOnClickPendingIntent(R.id.root, link(b.ctx, "recomp:///food"))
    v.setOnClickPendingIntent(R.id.add, link(b.ctx, "recomp:///food?focus=1"))
    return v
  }

  // ── Lift ──
  private fun lift(b: Box, d: JSONObject?): RemoteViews {
    if (!fresh(d)) return stale(b, "Lift")
    val state = d!!.optString("lift"); val done = state == "done" || state == "warm"; val todo = state == "todo"
    val v = RemoteViews(b.ctx.packageName, R.layout.w_lift)
    val head = when { todo || done -> "Lift day"; state == "rest" -> "Rest day"; state == "cardio" -> "Cardio day"; else -> "Train" }
    label(b, v, head, if (todo) "●" else if (done) "✓" else null, rightRed = todo)
    val go = if (todo) pill(b, "10 min", true) else null
    set(v, R.id.go, go)
    val text = if (done) "Done. That counts." else d.optString("liftLine").ifEmpty { "Nothing planned" }
    set(v, R.id.line, block(b, text, R.font.space_grotesk_bold, 13f * b.k.coerceAtMost(1.4f), WHITE, b.inner - (go?.width ?: 0) - b.px(10f).toInt(), 2))
    v.setOnClickPendingIntent(R.id.go, link(b.ctx, "recomp:///session?short=1"))
    v.setOnClickPendingIntent(R.id.root, link(b.ctx, "recomp:///train"))
    return v
  }

  // ── Level ──
  private val PIPS = intArrayOf(R.id.p0, R.id.p1, R.id.p2, R.id.p3, R.id.p4, R.id.p5, R.id.p6, R.id.p7, R.id.p8, R.id.p9,
    R.id.p10, R.id.p11, R.id.p12, R.id.p13, R.id.p14, R.id.p15, R.id.p16, R.id.p17, R.id.p18, R.id.p19)
  private fun level(b: Box, d: JSONObject?): RemoteViews {
    val r = d?.optJSONObject("rank") ?: return stale(b, "Level")
    val v = RemoteViews(b.ctx.packageName, R.layout.w_level)
    val streak = d.optInt("streak")
    label(b, v, "Level ${r.optInt("i") + 1}", if (streak > 0) "● $streak" else null, rightRed = true)
    set(v, R.id.name, line(b, r.optString("name"), R.font.space_grotesk_bold, 19f * b.k, WHITE))
    val span = r.optInt("span", 1).coerceIn(1, PIPS.size); val on = r.optInt("done", 0)
    PIPS.forEachIndexed { i, id ->
      v.setViewVisibility(id, if (i < span) View.VISIBLE else View.GONE)
      v.setInt(id, "setBackgroundResource", if (i < on) R.drawable.w_pip_on else R.drawable.w_pip_off)
    }
    val next = r.optString("next", ""); val need = r.optInt("need")
    set(v, R.id.sub, line(b, if (next.isNotEmpty() && next != "null") "$need day${if (need == 1) "" else "s"} to $next" else "Top rank. Keep it.", R.font.space_grotesk_medium, 11f * b.k.coerceAtMost(1.3f), GREY))
    v.setOnClickPendingIntent(R.id.root, link(b.ctx, "recomp:///"))
    return v
  }

  // ── Timer ──
  private val STARTS = intArrayOf(R.id.s0, R.id.s1, R.id.s2)
  private fun clockText(ms: Long): String {
    val s = ms / 1000; val h = s / 3600; val m = (s % 3600) / 60; val sec = s % 60
    return if (h > 0) "$h:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}" else "${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}"
  }
  private fun since(ms: Long): String {
    val c = Calendar.getInstance().apply { timeInMillis = ms }
    val h = c.get(Calendar.HOUR_OF_DAY); val m = c.get(Calendar.MINUTE)
    return "since ${(h + 11) % 12 + 1}:${m.toString().padStart(2, '0')} ${if (h < 12) "am" else "pm"}"
  }
  private fun timer(b: Box, d: JSONObject?): RemoteViews {
    val ctx = b.ctx
    val t = d?.optJSONObject("timer")
    val w = walk(ctx)
    if (t == null && w == null) {
      val v = RemoteViews(ctx.packageName, R.layout.w_timer_idle)
      label(b, v, "Habit timer", "Ready")
      val timed = mutableListOf<JSONObject>()
      val hs = d?.optJSONArray("habits")
      if (hs != null) for (i in 0 until hs.length()) { val h = hs.getJSONObject(i); if (h.optBoolean("timed")) timed.add(h) }
      STARTS.forEachIndexed { i, id ->
        if (i < timed.size) {
          set(v, id, pill(b, "▶ " + timed[i].optString("name"), false))
          v.setOnClickPendingIntent(id, link(ctx, "recomp:///?start=" + Uri.encode(timed[i].optString("id"))))
        } else set(v, id, null)
      }
      set(v, R.id.none, if (timed.isEmpty()) line(b, "Start a timed habit in the app", R.font.space_grotesk_medium, 11f * b.k, WHITE) else null)
      v.setOnClickPendingIntent(R.id.root, link(ctx, "recomp:///"))
      return v
    }
    val id = w?.habitId ?: t!!.optString("id")
    val isWalk = w != null
    val running = if (isWalk) w!!.running else t!!.optBoolean("running")
    val elapsed = if (isWalk) w!!.elapsed else t!!.optLong("elapsedMs") + if (running) System.currentTimeMillis() - t.optLong("at") else 0L
    val name = if (t != null && t.optString("id") == id) t.optString("name") else d?.optJSONObject("names")?.optString(id)?.ifEmpty { null } ?: "Walk"
    val start = if (t != null && t.optString("id") == id) t.optLong("since", 0L) else 0L
    val v = RemoteViews(ctx.packageName, R.layout.w_timer)
    val right = when { isWalk -> "${n(w!!.steps)} steps"; !running -> "Paused"; start > 0 -> since(start); else -> null }
    label(b, v, (if (running) "● " else "❚❚ ") + name + if (isWalk && !running) " · paused" else "", right, leftRed = running)
    val toggle = pill(b, if (running) "Pause" else "Resume", false)
    val stop = pill(b, "Stop", true)
    set(v, R.id.toggle, toggle); set(v, R.id.stop, stop)
    val clockMax = b.inner - toggle.width - stop.width - b.px(18f).toInt()
    // A walk's clock is redrawn every second by the walk tracker, in the dot font. Other
    // timers use the system clock view, which ticks on its own.
    if (isWalk || !running) {
      set(v, R.id.clockimg, line(b, clockText(elapsed), R.font.doto_black, 34f * b.k, WHITE, clockMax))
      v.setViewVisibility(R.id.clock, View.GONE)
      v.setChronometer(R.id.clock, SystemClock.elapsedRealtime() - elapsed, null, false)
    } else {
      set(v, R.id.clockimg, null)
      v.setViewVisibility(R.id.clock, View.VISIBLE)
      v.setChronometer(R.id.clock, SystemClock.elapsedRealtime() - elapsed, null, true)
    }
    set(v, R.id.sub, null)
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
  private fun habits(b: Box, d: JSONObject?): RemoteViews {
    if (!fresh(d)) return stale(b, "Habits")
    val hs = d!!.optJSONArray("habits")
    val count = hs?.length()?.coerceAtMost(6) ?: 0
    val runId = runningId(b.ctx, d)
    val v = RemoteViews(b.ctx.packageName, R.layout.w_habits)
    var met = 0
    for (i in 0 until count) if (hs!!.getJSONObject(i).optBoolean("met")) met++
    label(b, v, "Habits", if (count > 0) "$met / $count" else null)
    // Three tiles a row, 8 dp apart, each with 18 dp of padding inside.
    val tileText = ((b.inner - b.px(16f)) / 3 - b.px(18f)).toInt()
    val kk = b.k.coerceAtMost(1.35f)
    TILES.forEachIndexed { i, (box, nameId, valId) ->
      if (i >= count) { v.setViewVisibility(box, View.INVISIBLE); return@forEachIndexed }
      val h = hs!!.getJSONObject(i)
      val on = h.optString("id") == runId; val ok = h.optBoolean("met")
      v.setViewVisibility(box, View.VISIBLE)
      v.setInt(box, "setBackgroundResource", when { on -> R.drawable.w_tile_on; ok -> R.drawable.w_tile_done; else -> R.drawable.w_tile })
      set(v, nameId, line(b, (if (ok) "✓ " else if (on) "● " else "") + h.optString("name"), R.font.space_grotesk_bold, 11.5f * kk, if (on) RED else WHITE, tileText))
      set(v, valId, line(b, if (on) "running" else h.optString("val"), R.font.space_grotesk_medium, 10.5f * kk, GREY, tileText))
      val hid = Uri.encode(h.optString("id"))
      v.setOnClickPendingIntent(box, link(b.ctx, if (h.optBoolean("timed") && !on) "recomp:///?start=$hid" else "recomp:///?habit=$hid"))
    }
    v.setViewVisibility(R.id.row0, if (count > 0) View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.row1, if (count > 3) View.VISIBLE else View.GONE)
    set(v, R.id.none, if (count == 0) line(b, "Add habits in the app", R.font.space_grotesk_medium, 11f * b.k, WHITE) else null)
    v.setOnClickPendingIntent(R.id.root, link(b.ctx, "recomp:///"))
    return v
  }
}

/** One provider per widget; all of them draw through RecompWidgets, and redraw when resized. */
abstract class RecompWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) RecompWidgets.draw(context, appWidgetManager, this::class.java, id)
  }
  override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
    RecompWidgets.draw(context, appWidgetManager, this::class.java, appWidgetId)
  }
}
class StepsWidget : RecompWidget()
class FoodWidget : RecompWidget()
class LiftWidget : RecompWidget()
class LevelWidget : RecompWidget()
class TimerWidget : RecompWidget()
class HabitsWidget : RecompWidget()
