package expo.modules.walktracker

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** What JS sees: start, pause, resume and stop a tracked walk, and read where it is. */
class WalkTrackerModule : Module() {
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
      n
    }

    Function("state") {
      val s = WalkStore(ctx)
      mapOf(
        "active" to s.active, "running" to s.running, "habitId" to s.habitId,
        "steps" to s.steps(), "elapsedMs" to s.elapsed(System.currentTimeMillis()).toDouble(),
      )
    }

    /** Pauses and resumes tapped on the notification since last asked: "p:<ms>" or "r:<ms>". */
    Function("takeEvents") {
      WalkStore(ctx).takeEvents()
    }
  }
}
