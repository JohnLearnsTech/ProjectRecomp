package expo.modules.walktracker

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** What JS sees: start, pause, resume and stop a tracked walk, and read where it is. */
class WalkTrackerModule : Module() {
  // Calibration: a raw count from the step counter while the person walks a counted number of steps.
  private var calListener: SensorEventListener? = null
  @Volatile private var calBase = -1f
  @Volatile private var calLast = -1f
  private fun sensors() = ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager?

  private val ctx: Context get() = appContext.reactContext?.applicationContext ?: throw IllegalStateException("No context")

  override fun definition() = ModuleDefinition {
    Name("WalkTracker")

    Function("hasStepSensor") {
      (ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager?)?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
    }

    /** Start tracking a walk; accumMs and steps carry over a timer that was already running. */
    Function("start") { habitId: String, name: String, accumMs: Double, steps: Int ->
      WalkStore(ctx).begin(habitId, name, accumMs.toLong(), steps, System.currentTimeMillis())
      WalkService.sync(ctx)
    }

    Function("pause") {
      WalkStore(ctx).pause(System.currentTimeMillis(), false)
      WalkService.sync(ctx)
    }

    Function("resume") {
      WalkStore(ctx).resume(System.currentTimeMillis(), false)
      WalkService.sync(ctx)
    }

    /** Ends tracking and returns the steps walked. */
    Function("stop") {
      val store = WalkStore(ctx)
      val n = store.steps()
      store.clear()
      WalkService.instance?.refresh()
      RecompWidgets.refresh(ctx, null)
      n
    }

    Function("state") {
      val s = WalkStore(ctx)
      mapOf(
        "active" to s.active, "running" to s.running, "habitId" to s.habitId,
        "steps" to s.steps(), "elapsedMs" to s.elapsed(System.currentTimeMillis()).toDouble(),
      )
    }

    /** Start counting raw steps for calibration. */
    Function("calStart") {
      calListener?.let { sensors()?.unregisterListener(it) }
      calBase = -1f; calLast = -1f
      val sensor = sensors()?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return@Function false
      val l = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) { if (calBase < 0f) calBase = e.values[0]; calLast = e.values[0] }
        override fun onAccuracyChanged(s: Sensor?, a: Int) {}
      }
      calListener = l
      sensors()?.registerListener(l, sensor, SensorManager.SENSOR_DELAY_FASTEST) == true
    }
    /** Raw steps counted since calStart. */
    Function("calSteps") { if (calBase < 0f) 0 else (calLast - calBase).toInt() }
    /** Stop calibration counting; returns the raw steps. */
    Function("calStop") {
      calListener?.let { sensors()?.unregisterListener(it) }
      calListener = null
      if (calBase < 0f) 0 else (calLast - calBase).toInt()
    }
    Function("getFactor") { WalkStore.factor(ctx).toDouble() }
    Function("setFactor") { f: Double -> WalkStore.setFactor(ctx, f.toFloat().coerceIn(0.5f, 1.5f)) }

    /** Today's numbers for the home screen widgets (JSON), redrawn at once. */
    Function("setWidgetData") { json: String ->
      RecompWidgets.save(ctx, json)
    }

    /** Pauses and resumes tapped on the notification since last asked: "p:<ms>" or "r:<ms>". */
    Function("takeEvents") {
      WalkStore(ctx).takeEvents()
    }
  }
}
