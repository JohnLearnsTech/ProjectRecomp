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
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.text.TextPaint
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.NumberFormat
import java.time.LocalDate
import java.util.Calendar
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * The six home screen widgets in the Dot Matrix style. Every widget is one card (w_card): a label
 * row at the top, the content centred in the middle, and an optional row of one or two buttons at
 * the bottom, with the same inset at top, bottom and sides. Android widgets can't use an app's
 * fonts in text views, so every piece is drawn here as an image in the bundled Doto (numbers) and
 * Space Grotesk (labels) fonts. Sizes follow the widget: k = min(height / base height,
 * width / base width); big numbers scale by k, everything else by k^0.7. These are the same rules
 * as the design previews.
 */
object RecompWidgets {
  private const val PREFS = "recomp_widgets"
  private val WHITE = Color.WHITE
  private val GREY = Color.parseColor("#8C8C8C")
  private val DIM = Color.parseColor("#484848")
  private val OFF = Color.parseColor("#2B2B2B")
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

  fun draw(ctx: Context, mgr: AppWidgetManager, cls: Class<out AppWidgetProvider>, id: Int) {
    val d = load(ctx)
    val opts = try { mgr.getAppWidgetOptions(id) } catch (e: Exception) { null }
    val oneRow = cls == StepsWidget::class.java || cls == LiftWidget::class.java
    val c = Card(ctx, opts, if (oneRow) 135 else 135, if (oneRow) 60 else 136)
    try {
      when (cls) {
        StepsWidget::class.java -> steps(c, d)
        FoodWidget::class.java -> food(c, d)
        LiftWidget::class.java -> lift(c, d)
        LevelWidget::class.java -> level(c, d)
        TimerWidget::class.java -> timer(c, d)
        else -> habits(c, d)
      }
    } catch (e: Exception) { c.reset(); stale(c, "Recomp") }
    mgr.updateAppWidget(id, c.v)
  }

  // ── The card: sizes, padding, and the three parts ──
  private class Card(val ctx: Context, opts: Bundle?, baseW: Int, baseH: Int) {
    val density = ctx.resources.displayMetrics.density
    val wDp = (opts?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) ?: 0).takeIf { it > 0 } ?: baseW
    val hDp = (opts?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) ?: 0).takeIf { it > 0 } ?: baseH
    val k = min(hDp.toFloat() / baseH, wDp.toFloat() / baseW).coerceIn(0.75f, 2.6f)
    val ks = k.toDouble().pow(0.7).toFloat()
    val side = 16f * min(k, 1.6f)
    val vert = if (hDp > 80) side else 12f * min(k, 1.6f)
    val inner = ((wDp - 2 * side) * density).toInt().coerceAtLeast(40)
    /** Height in px left for the middle once padding is taken. */
    val heightPx = ((hDp - 2 * vert) * density).toInt().coerceAtLeast(20)
    var v = RemoteViews(ctx.packageName, R.layout.w_card)
    init { pad() }
    fun reset() { v = RemoteViews(ctx.packageName, R.layout.w_card); pad() }
    private fun pad() { val s = px(side); val t = px(vert); v.setViewPadding(R.id.root, s, t, s, t) }
    fun px(dp: Float) = (dp * density).toInt()
    fun g(dp: Float) = dp * ks * density
  }

  // ── Fonts and text ──
  private val fonts = HashMap<Int, Typeface>()
  private fun font(ctx: Context, res: Int): Typeface = fonts.getOrPut(res) { try { ctx.resources.getFont(res) } catch (e: Exception) { Typeface.DEFAULT_BOLD } }
  private fun paint(c: Card, res: Int, sp: Float, color: Int, spacing: Float = 0f) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = font(c.ctx, res); textSize = sp * c.density; this.color = color; letterSpacing = spacing
  }
  private fun capBox(p: Paint, s: String = "H"): Rect { val r = Rect(); p.getTextBounds(s, 0, s.length, r); return r }
  private fun ellipsize(p: Paint, s: String, maxPx: Float): String {
    var t = s
    while (p.measureText(t) > maxPx && t.length > 1) t = t.dropLast(2).trimEnd(' ', '·') + "…"
    return t
  }

  // ── Dot-matrix icons (9 x 9), drawn as square dots like the Doto digits ──
  private val ICONS = mapOf(
    "clock" to arrayOf("..#####..", ".#.....#.", "#...#...#", "#...#...#", "#...###.#", "#.......#", "#.......#", ".#.....#.", "..#####.."),
    "feet" to arrayOf(".##......", "####.....", "####.....", "####..##.", ".##..####", ".....####", ".##..####", ".##...##.", "......##."),
    "flame" to arrayOf("....#....", "...##....", "...###...", "..####...", "..#####..", ".###.###.", ".##...##.", ".##...##.", "..#####.."),
    "kettlebell" to arrayOf("...###...", "..#...#..", "..#...#..", ".#######.", "#########", "#########", "#########", ".#######.", "........."),
    "check" to arrayOf(".........", "........#", ".......##", "......##.", "#....##..", "##..##...", ".####....", "..##.....", "........."),
  )
  private fun icon(cv: Canvas, kind: String, x: Float, y: Float, size: Float, color: Int) {
    val rows = ICONS[kind] ?: return
    val cell = size / rows.size; val dot = cell * 0.8f
    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
    rows.forEachIndexed { r, row -> row.forEachIndexed { col, ch -> if (ch == '#') cv.drawRect(x + col * cell, y + r * cell, x + col * cell + dot, y + r * cell + dot, p) } }
  }

  // ── The label row: left text, and a right text that shortens or drops when there's no room ──
  private fun label(c: Card, left: String, right: String? = null, leftRed: Boolean = false, rightRed: Boolean = false, short: String? = null) {
    val p = paint(c, R.font.space_grotesk_medium, 10f * c.ks, GREY, 0.14f)
    val l = left.uppercase(Locale.ROOT)
    val gap = 10f * c.density
    fun fits(r: String?) = r == null || p.measureText(l) + gap + p.measureText(r.uppercase(Locale.ROOT)) <= c.inner
    val r = (if (fits(right)) right else if (fits(short)) short else null)?.uppercase(Locale.ROOT)
    val fm = p.fontMetrics
    val bmp = Bitmap.createBitmap(c.inner, ceil(fm.descent - fm.ascent).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
    val cv = Canvas(bmp)
    p.color = if (leftRed) RED else GREY
    cv.drawText(ellipsize(p, l, c.inner.toFloat()), 0f, -fm.ascent, p)
    if (r != null) { p.color = if (rightRed) RED else GREY; cv.drawText(r, c.inner - p.measureText(r), -fm.ascent, p) }
    c.v.setImageViewBitmap(R.id.lbl, bmp)
  }

  // ── The middle: a stack of parts, each centred, with an even gap between them ──
  private interface Part { val h: Float; fun draw(cv: Canvas, y: Float) }

  /** A big Doto number with an optional dot icon in front, shrunk until it fits the width. */
  private class Hero(val c: Card, val text: String, sp0: Float, val color: Int = WHITE, val ico: String? = null, val icoColor: Int = color, maxW: Float = c.inner.toFloat()) : Part {
    val p: Paint
    val cap: Rect
    val width: Float
    init {
      var sp = sp0 * c.k
      var pp = paint(c, R.font.doto_black, sp, color)
      fun w(q: Paint): Float { val cb = capBox(q, "0"); return q.measureText(text) + if (ico != null) cb.height() * 1.24f else 0f }
      while (w(pp) > maxW && sp > 10f) { sp -= 1f; pp = paint(c, R.font.doto_black, sp, color) }
      p = pp; cap = capBox(p, "0"); width = w(p)
    }
    override val h get() = cap.height().toFloat()
    fun drawAt(cv: Canvas, x0: Float, y: Float) {
      var x = x0
      if (ico != null) { val s = cap.height() * 0.92f; icon(cv, ico, x, y + (cap.height() - s) / 2, s, icoColor); x += s + cap.height() * 0.32f }
      cv.drawText(text, x, y - cap.top, p)
    }
    override fun draw(cv: Canvas, y: Float) = drawAt(cv, (c.inner - width) / 2, y)
  }

  /** A centred line of text, cut short with … to fit. */
  private class Line(val c: Card, text: String, val color: Int = GREY, res: Int = R.font.space_grotesk_medium, sp: Float = 11f * c.ks) : Part {
    val p = paint(c, res, sp, color)
    val t = ellipsize(p, text, c.inner.toFloat())
    val top = capBox(p, "H").top
    override val h get() = (capBox(p, "Hg").bottom - top).toFloat()
    override fun draw(cv: Canvas, y: Float) { cv.drawText(t, (c.inner - p.measureText(t)) / 2, y - top, p) }
  }

  /** A row of pips: one per step of progress. */
  private class Pips(val c: Card, val n: Int, val on: Int) : Part {
    override val h get() = 6f * c.ks * c.density
    override fun draw(cv: Canvas, y: Float) {
      val gap = 3f * c.density; val w = (c.inner - gap * (n - 1)) / n
      val p = Paint(Paint.ANTI_ALIAS_FLAG)
      for (i in 0 until n) { p.color = if (i < on) WHITE else OFF; val x = i * (w + gap); cv.drawRoundRect(RectF(x, y, x + w, y + h), h / 2, h / 2, p) }
    }
  }

  /** Any custom part (the walk timer's side-by-side numbers). */
  private class Custom(override val h: Float, val fn: (Canvas, Float) -> Unit) : Part { override fun draw(cv: Canvas, y: Float) = fn(cv, y) }

  /** Draw the parts into the middle image: centred, 12 dp apart, 10 dp clear of the label and buttons. */
  private fun body(c: Card, parts: List<Part>) {
    val gap = c.g(12f); val margin = c.g(10f)
    val total = parts.sumOf { it.h.toDouble() }.toFloat() + gap * (parts.size - 1)
    val bmp = Bitmap.createBitmap(c.inner, ceil(total + margin * 2).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
    val cv = Canvas(bmp)
    var y = margin
    for (pt in parts) { pt.draw(cv, y); y += pt.h + gap }
    c.v.setImageViewBitmap(R.id.body, bmp)
  }

  // ── Buttons: one spans the row, two share it; text centred on its capitals ──
  private class Btn(val text: String, val filled: Boolean, val icon: String?, val intent: PendingIntent)
  private fun pillHeight(c: Card): Float { val p = paint(c, R.font.space_grotesk_bold, 11f * c.ks, BLACK, 0.06f); return capBox(p).height() + 2 * c.g(7.5f) }
  private fun buttons(c: Card, items: List<Btn>) {
    c.v.setViewVisibility(R.id.btns, View.VISIBLE)
    val gap = 8f * c.density
    val w = ((c.inner - gap * (items.size - 1)) / items.size).toInt()
    listOf(R.id.b0, R.id.b1).forEachIndexed { i, id ->
      if (i >= items.size) { c.v.setViewVisibility(id, View.GONE); return@forEachIndexed }
      val b = items[i]
      c.v.setViewVisibility(id, View.VISIBLE)
      c.v.setImageViewBitmap(id, pill(c, b.text, b.filled, b.icon, w))
      c.v.setOnClickPendingIntent(id, b.intent)
    }
    c.v.setViewVisibility(R.id.bgap, if (items.size > 1) View.VISIBLE else View.GONE)
  }
  private fun pill(c: Card, s: String, filled: Boolean, icon: String?, width: Int): Bitmap {
    val p = paint(c, R.font.space_grotesk_bold, 11f * c.ks, if (filled) BLACK else WHITE, 0.06f)
    val t = s.uppercase(Locale.ROOT)
    val cap = capBox(p)
    val h = ceil(cap.height() + 2 * c.g(7.5f)).toInt()
    val ic = if (icon != null) cap.height() * 0.9f else 0f
    val icGap = if (icon != null) c.g(5f) else 0f
    val content = p.measureText(t) + ic + icGap
    val bmp = Bitmap.createBitmap(width.coerceAtLeast(h), h, Bitmap.Config.ARGB_8888)
    val cv = Canvas(bmp)
    val stroke = 1.5f * c.density
    val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = WHITE; style = if (filled) Paint.Style.FILL else Paint.Style.STROKE; strokeWidth = stroke }
    cv.drawRoundRect(RectF(stroke / 2, stroke / 2, bmp.width - stroke / 2, h - stroke / 2), h / 2f, h / 2f, bg)
    val col = if (filled) BLACK else WHITE
    val mid = h / 2f
    var x = (bmp.width - content) / 2
    val ip = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = col }
    when (icon) {
      "play" -> cv.drawPath(Path().apply { moveTo(x, mid - ic / 2); lineTo(x, mid + ic / 2); lineTo(x + ic * 0.87f, mid); close() }, ip)
      "plus" -> { val th = max(2f, ic * 0.2f); cv.drawRect(x, mid - th / 2, x + ic, mid + th / 2, ip); cv.drawRect(x + ic / 2 - th / 2, mid - ic / 2, x + ic / 2 + th / 2, mid + ic / 2, ip) }
    }
    x += ic + icGap
    cv.drawText(t, x, mid - cap.height() / 2f - cap.top, p)
    return bmp
  }

  // ── Helpers ──
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
  private fun clockText(ms: Long): String {
    val s = ms / 1000; val h = s / 3600; val m = (s % 3600) / 60; val sec = s % 60
    return if (h > 0) "$h:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}" else "${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}"
  }
  private fun hhmm(ms: Long): String {
    val cal = Calendar.getInstance().apply { timeInMillis = ms }
    val h = cal.get(Calendar.HOUR_OF_DAY); val m = cal.get(Calendar.MINUTE)
    return "${(h + 11) % 12 + 1}:${m.toString().padStart(2, '0')}"
  }

  private fun stale(c: Card, name: String) {
    label(c, name)
    body(c, listOf(Line(c, "Tap to load today", WHITE, R.font.space_grotesk_bold, 13f * c.ks)))
    c.v.setOnClickPendingIntent(R.id.root, link(c.ctx, "recomp:///"))
  }

  // ── Steps ──
  private fun steps(c: Card, d: JSONObject?) {
    if (!fresh(d)) return stale(c, "Steps")
    val w = walk(c.ctx)
    val total = d!!.optInt("steps") + (w?.steps ?: 0)
    val target = d.optInt("stepsTarget", 1).coerceAtLeast(1)
    label(c, when { w == null -> "Steps"; w.running -> "● Live"; else -> "❚❚ Paused" }, if (total >= target) "✓ Target" else "${total * 100 / target}%", leftRed = w?.running == true)
    body(c, listOf(Hero(c, n(total), 28f, ico = "feet")))
    c.v.setOnClickPendingIntent(R.id.root, link(c.ctx, "recomp:///"))
  }

  // ── Food ──
  private fun food(c: Card, d: JSONObject?) {
    if (!fresh(d)) return stale(c, "Food")
    val left = d!!.optInt("kcalLeft"); val over = left < 0; val p = d.optInt("proteinLeft")
    label(c, "Food", if (over) "kcal over" else "kcal left", rightRed = over)
    body(c, listOf(Hero(c, n(Math.abs(left)), 36f, if (over) RED else WHITE, "flame"), Line(c, if (p > 0) "${n(p)} g protein to go" else "Protein done ✓")))
    buttons(c, listOf(Btn("Add", true, "plus", link(c.ctx, "recomp:///food?focus=1"))))
    c.v.setOnClickPendingIntent(R.id.root, link(c.ctx, "recomp:///food"))
  }

  // ── Lift ──
  private fun lift(c: Card, d: JSONObject?) {
    if (!fresh(d)) return stale(c, "Lift")
    val state = d!!.optString("lift"); val done = state == "done" || state == "warm"; val todo = state == "todo"
    when {
      todo -> {
        val at = d.optString("liftAt", "")
        label(c, "Lift day", if (at.isNotEmpty()) "Before $at" else "10 min", rightRed = true, short = at.ifEmpty { null })
        body(c, listOf(Hero(c, "10:00", 28f, ico = "kettlebell")))
        c.v.setOnClickPendingIntent(R.id.root, link(c.ctx, "recomp:///session?short=1"))
        return
      }
      done -> { label(c, "Lift day", "✓"); body(c, listOf(Hero(c, if (state == "warm") "WARM" else "DONE", 28f))) }
      state == "rest" -> { label(c, "Rest day"); body(c, listOf(Hero(c, "REST", 28f))) }
      state == "cardio" -> { label(c, "Cardio day"); body(c, listOf(Hero(c, "WALK", 28f, ico = "feet"))) }
      else -> { label(c, "Train"); body(c, listOf(Hero(c, "--", 28f))) }
    }
    c.v.setOnClickPendingIntent(R.id.root, link(c.ctx, "recomp:///train"))
  }

  // ── Level ──
  private fun level(c: Card, d: JSONObject?) {
    val r = d?.optJSONObject("rank") ?: return stale(c, "Level")
    val streak = d.optInt("streak")
    label(c, "Level ${r.optInt("i") + 1}", if (streak > 0) "● $streak" else null, rightRed = true)
    val span = r.optInt("span", 1).coerceIn(1, 20); val on = r.optInt("done", 0)
    val next = r.optString("next", ""); val need = r.optInt("need")
    body(c, listOf(
      Line(c, r.optString("name"), WHITE, R.font.space_grotesk_bold, 19f * c.k),
      Pips(c, span, on),
      Line(c, if (next.isNotEmpty() && next != "null") "$need day${if (need == 1) "" else "s"} to $next" else "Top rank. Keep it."),
    ))
    c.v.setOnClickPendingIntent(R.id.root, link(c.ctx, "recomp:///"))
  }

  // ── Habits ──
  private fun habits(c: Card, d: JSONObject?) {
    if (!fresh(d)) return stale(c, "Habits")
    val hs = d!!.optJSONArray("habits")
    val count = hs?.length() ?: 0
    var met = 0; val left = mutableListOf<String>()
    for (i in 0 until count) { val h = hs!!.getJSONObject(i); if (h.optBoolean("met")) met++ else left.add(h.optString("name")) }
    label(c, "Habits")
    if (count == 0) body(c, listOf(Line(c, "Add habits in the app", WHITE)))
    else body(c, listOf(Hero(c, "$met/$count", 36f, ico = "check"), Pips(c, count.coerceAtMost(20), met),
      Line(c, if (left.isEmpty()) "All done today ✓" else "Left: " + left.joinToString(" · "))))
    c.v.setOnClickPendingIntent(R.id.root, link(c.ctx, "recomp:///"))
  }

  // ── Habit timer ──
  private fun timer(c: Card, d: JSONObject?) {
    val ctx = c.ctx
    val t = d?.optJSONObject("timer")
    val w = walk(ctx)
    if (t == null && w == null) {
      label(c, "Habit timer", "Ready")
      val timed = mutableListOf<JSONObject>()
      val hs = d?.optJSONArray("habits")
      if (hs != null) for (i in 0 until hs.length()) { val h = hs.getJSONObject(i); if (h.optBoolean("timed")) timed.add(h) }
      // The walk first if there is one: it's the timer this widget is mostly for.
      val walkIds = d?.optJSONArray("walkIds")
      val first = timed.firstOrNull { h -> walkIds != null && (0 until walkIds.length()).any { walkIds.optString(it) == h.optString("id") } } ?: timed.firstOrNull()
      body(c, listOf(Hero(c, "00:00", 36f, DIM, "clock"), Line(c, if (timed.isEmpty()) "Add a timed habit in the app" else timed.joinToString(" · ") { it.optString("name") })))
      if (first != null) buttons(c, listOf(Btn(first.optString("name"), true, "play", link(ctx, "recomp:///?start=" + Uri.encode(first.optString("id"))))))
      c.v.setOnClickPendingIntent(R.id.root, link(ctx, "recomp:///"))
      return
    }
    val id = w?.habitId ?: t!!.optString("id")
    val isWalk = w != null
    val running = if (isWalk) w!!.running else t!!.optBoolean("running")
    val elapsed = if (isWalk) w!!.elapsed else t!!.optLong("elapsedMs") + if (running) System.currentTimeMillis() - t.optLong("at") else 0L
    val name = if (t != null && t.optString("id") == id) t.optString("name") else d?.optJSONObject("names")?.optString(id)?.ifEmpty { null } ?: "Walk"
    val since = if (t != null && t.optString("id") == id) t.optLong("since", 0L) else 0L
    label(c, (if (running) "● " else "❚❚ ") + name, if (!running) "Paused" else if (since > 0) "Since ${hhmm(since)}" else null,
      leftRed = running, short = if (!running) null else if (since > 0) hhmm(since) else null)
    buttons(c, listOf(
      Btn(if (running) "Pause" else "Resume", false, null,
        if (isWalk) walkAction(ctx, if (running) WalkService.ACTION_PAUSE else WalkService.ACTION_RESUME)
        else link(ctx, (if (running) "recomp:///?pause=" else "recomp:///?start=") + Uri.encode(id))),
      Btn("Stop", true, null, link(ctx, "recomp:///?stop=" + Uri.encode(id))),
    ))
    c.v.setOnClickPendingIntent(R.id.root, link(ctx, "recomp:///?habit=" + Uri.encode(id)))
    val timeCol = WHITE
    if (!isWalk && running) {
      // Only a walk has a service to redraw the dot clock each second; other timers tick on
      // their own in the system clock view.
      c.v.setViewVisibility(R.id.clock, View.VISIBLE)
      c.v.setChronometer(R.id.clock, SystemClock.elapsedRealtime() - elapsed, null, true)
      c.v.setImageViewBitmap(R.id.body, Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888))
      return
    }
    c.v.setViewVisibility(R.id.clock, View.GONE)
    c.v.setChronometer(R.id.clock, SystemClock.elapsedRealtime(), null, false)
    val time = clockText(elapsed)
    if (!isWalk) { body(c, listOf(Hero(c, time, 30f, timeCol, "clock", if (running) RED else GREY))); return }
    // A walk: time and steps at the same size, side by side when they fit, else stacked; both shrink
    // to fit the space between the label and the buttons.
    val steps = n(w!!.steps)
    val room = c.heightPx - c.g(40f) - pillHeight(c) - c.g(20f)
    var sp = 30f
    fun pair(s: Float): Pair<Boolean, Float> {
      val a = Hero(c, time, s, ico = "clock", maxW = Float.MAX_VALUE); val b = Hero(c, steps, s, ico = "feet", maxW = Float.MAX_VALUE)
      return if (a.width + b.width + c.g(26f) <= c.inner) Pair(true, a.h) else Pair(false, a.h * 2 + c.g(12f))
    }
    while (sp > 14f && pair(sp).second > room) sp -= 1f
    val (side, _) = pair(sp)
    val clockColor = if (running) RED else GREY
    if (side) {
      val a = Hero(c, time, sp, ico = "clock", icoColor = clockColor, maxW = Float.MAX_VALUE); val b = Hero(c, steps, sp, ico = "feet", maxW = Float.MAX_VALUE)
      body(c, listOf(Custom(a.h) { cv, y -> a.drawAt(cv, 0f, y); b.drawAt(cv, c.inner - b.width, y) }))
    } else body(c, listOf(Hero(c, time, sp, ico = "clock", icoColor = clockColor), Hero(c, steps, sp, ico = "feet")))
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
