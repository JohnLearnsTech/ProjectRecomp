// Recomp MCP connector. Each friend adds it in their own Claude app (Settings, Connectors) and
// signs in with their Recomp account through Supabase Auth's OAuth 2.1 server. Every query runs
// as that person, so Row Level Security limits Claude to their rows, and their own Claude
// subscription pays for the thinking (reference/00-BUILD-PLAN.md).
//
// Safety rules (reference/docs/02-architecture-handoff.md section 4), enforced here, not left
// to the model: never below the calorie floor, never cut protein, one change per review, plan
// changes are only proposed (the person applies them in the app), and no tool reads or writes
// checks, notes or milestones, which is where medicines and health notes live.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { pipeline } from '@supabase/middleware';
import { withOAuthProtectedResource, withSupabase } from '@supabase/server';
import { z } from 'zod';
import { buildProposal, compactPlan, foodEstimatePrompt, minus, normReview, planPrompt, planRules, planWeekdays, r1, reviewPrompt } from '../_shared/domain/ai.ts';
import { d, diffDays } from '../_shared/domain/dates.ts';
import { cacheKeyOf, foodTotals, isDish, normFood, parseItem, portionOf, scaleEst } from '../_shared/domain/food.ts';
import { defaultPlanFor, kcalFloor, proteinFloor } from '../_shared/domain/plan.ts';
import { daysFor, loadContext, loadEntries, logFoodText, type Ctx } from '../_shared/data.ts';

const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 1) }] });
const fail = (msg: string) => ({ content: [{ type: 'text' as const, text: msg }], isError: true });
const must = <T>(r: { data: T; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data; };
const round1 = (x: number) => Math.round(x * 10) / 10;
const DateArg = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD in the person\'s own calendar. Leave out for today.');

/** Writes are allowed from 60 days back up to today, never in the future. */
function writeDay(ctx: Ctx, date?: string) {
  const k = date || ctx.today;
  if (k > ctx.today) throw new Error(`${k} is in the future for this person (today is ${ctx.today}).`);
  if (diffDays(d(k), d(ctx.today)) > 60) throw new Error('Only the last 60 days can be changed from here.');
  return k;
}

Deno.serve(
  pipeline([withOAuthProtectedResource(), withSupabase({ auth: 'user' })], async (req, { supabase: sb }) => {
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: 'recomp', version: '1.0.0' }, {
        instructions: 'Recomp is the person\'s fat-loss and training log. Read with get_day, get_week_summary and get_plan. '
          + 'To estimate foods, call list_pending_foods, then set_food_estimates for every row in one call. Calories and macros are always per 100 g; the app scales portions. '
          + 'Plan changes are proposals the person accepts in the app. Never give advice about medicines or doses.',
      });
      const ctxP = loadContext(sb);

      server.registerTool('get_day', {
        title: 'Get a day', description: 'One day of the log: the plan for the day (session, calorie, protein and step targets), weight, steps, sleep, food rows and totals, sets, and habits.',
        inputSchema: z.object({ date: DateArg }), annotations: { readOnlyHint: true },
      }, async ({ date }) => {
        const ctx = await ctxP, k = date || ctx.today, p = ctx.engine.plan(k);
        const [log, food, sets, hl] = await Promise.all([
          sb.from('day_logs').select('weight_kg, steps, sleep_h, waist_cm, note').eq('date', k).maybeSingle(),
          sb.from('food_entries').select('id, meal_no, label, kcal, protein_g, carbs_g, fat_g, fiber_g, source, needs_estimate').eq('date', k).order('position'),
          sb.from('set_entries').select('exercise_name, set_no, weight_kg, band_slot, reps').eq('date', k).order('exercise_name').order('set_no'),
          sb.from('habit_logs').select('habit_id, value').eq('date', k),
        ]);
        const rows = must(food) as any[];
        const t = foodTotals(rows.map((r) => ({ kcal: +r.kcal, p: +r.protein_g, c: +r.carbs_g, f: +r.fat_g, fib: +r.fiber_g })));
        return text({
          date: k, today: ctx.today,
          plan: p.inRange ? { week: p.week, phase: p.phase, type: p.type, session: p.session ? ctx.engine.NAMES[p.session] : null, cardio: p.cardio, kcal: p.kcal, protein: p.protein, steps: p.steps } : 'outside the plan',
          measured: must(log), food: rows, totals: { kcal: Math.round(t.kcal), protein: Math.round(t.p), carbs: Math.round(t.c), fat: Math.round(t.f), fiber: Math.round(t.fib) },
          sets: must(sets), habits: (must(hl) as any[]).map((h) => ({ ...h, name: ctx.habits.find((x) => x.id === h.habit_id)?.name })),
        });
      });

      server.registerTool('get_week_summary', {
        title: 'Get the week', description: 'The 7 days ending on a date (default today), the week before and the one before that, with targets, floors and the goal. Includes the weekly review instructions to follow before calling save_weekly_review.',
        inputSchema: z.object({ end_date: DateArg }), annotations: { readOnlyHint: true },
      }, async ({ end_date }) => {
        const ctx = await ctxP, { D } = await daysFor(sb, ctx), end = end_date || ctx.maxDay;
        const pfl = proteinFloor(ctx.profile, ctx.goal), kfl = kcalFloor(ctx.profile), pl = ctx.engine.plan(end), r = D.rateOfLoss();
        const two = D.weekStats(minus(end, 14), pfl);
        const data = {
          week: D.weekStats(end, pfl), weekBefore: D.weekStats(minus(end, 7), pfl), twoWeeksBefore: { weightAvg: two.weightAvg, weighIns: two.weighIns },
          targets: { kcal: pl.kcal, protein: pl.protein, proteinFloor: pfl, kcalFloor: kfl, steps: pl.steps, sleepHours: 7 },
          goal: { name: ctx.goal.name, startKg: ctx.engine.T.START_KG, targetKg: ctx.engine.T.TARGET_KG, end: ctx.goal.due, lossPerWeekKg: r && r.perDay < 0 ? r1(-r.perDay * 7) : null },
          phase: pl.inRange ? ctx.engine.PL.phases[pl.phase - 1].name : null, weekOfPlan: pl.week,
        };
        // The same instructions the app's weekly review sends, so a review from here reads the same.
        return text({ data, review_instructions: reviewPrompt(ctx.goal.type, ctx.goal.type === 'muscle', kfl, '(the data above)').replace(/Reply with ONLY JSON shaped:[\s\S]*$/, 'To save it, call save_weekly_review with these fields: grade, headline, truths, leak, commitments, wins, suggestion {what, why, change: {kcal} or {steps} or null}.') });
      });

      server.registerTool('list_pending_foods', {
        title: 'List foods without numbers', description: 'Food rows logged without calories yet (the app could not match them), newest first, with the estimating instructions to follow for set_food_estimates.',
        inputSchema: z.object({ days: z.number().int().min(1).max(60).default(14).describe('How many days back to look') }), annotations: { readOnlyHint: true },
      }, async ({ days }) => {
        const ctx = await ctxP;
        const rows = must(await sb.from('food_entries').select('id, date, meal_no, label, raw_text').eq('needs_estimate', true).gte('date', minus(ctx.today, days)).order('date', { ascending: false }).order('position')) as any[];
        const list = rows.map((r) => ({ id: r.id, date: r.date, meal: r.meal_no, description: r.raw_text || r.label }));
        return text({ pending: list, how_to_estimate: foodEstimatePrompt(list.map((x) => x.description), ctx.profile.cuisine).replace(/Reply with ONLY a JSON array[\s\S]*$/, 'Then call set_food_estimates once with one estimate per row id: name, serving_g and per100 {kcal, p, c, f, fib}.') });
      });

      server.registerTool('set_food_estimates', {
        title: 'Fill in food estimates', description: 'Give numbers to rows from list_pending_foods, all in one call. Values are PER 100 g of the cooked food (per 100 ml for drinks); serving_g is one piece when counted in pieces, else one typical serving, or the whole dish when its ingredients are listed. The app scales by the portion in the description and remembers the food for next time. Rows the person typed or scanned are never overwritten.',
        inputSchema: z.object({ estimates: z.array(z.object({
          id: z.string().uuid(), name: z.string().min(1).max(80).describe('What the food is, without any weight'), serving_g: z.number().min(1).max(2000),
          per100: z.object({ kcal: z.number().min(0).max(900), p: z.number().min(0).max(100), c: z.number().min(0).max(100), f: z.number().min(0).max(100), fib: z.number().min(0).max(60) }),
        })).min(1).max(40) }),
      }, async ({ estimates }) => {
        const ctx = await ctxP, done: unknown[] = [], skipped: unknown[] = [];
        for (const e of estimates) {
          const row = must(await sb.from('food_entries').select('id, date, label, raw_text, source, needs_estimate').eq('id', e.id).maybeSingle()) as any;
          if (!row) { skipped.push({ id: e.id, why: 'not found' }); continue; }
          if (!row.needs_estimate && row.source !== 'claude') { skipped.push({ id: e.id, why: `kept: the row is ${row.source === 'you' ? 'typed by the person' : row.source}` }); continue; }
          const desc = row.raw_text || row.label, rec = { name: e.name, serving_g: e.serving_g, per100: e.per100 };
          const po = portionOf(desc, rec), s = scaleEst(rec, po.g, po.n);
          must(await sb.from('food_entries').update({ label: s.label, grams: round1(po.g), kcal: s.kcal, protein_g: s.p, carbs_g: s.c, fat_g: s.f, fiber_g: s.fib, source: 'claude', cache_key: isDish(desc) ? null : cacheKeyOf(desc) }).eq('id', e.id));
          // Remember it, as the app does: per 100 g under its key, and in the person's own foods.
          const k = isDish(desc) ? null : cacheKeyOf(desc);
          if (k) {
            await sb.from('food_cache_user').upsert({ key: k, name: e.name, serving_g: e.serving_g, unit_only: false, source: 'claude', kcal_100g: e.per100.kcal, protein_100g: e.per100.p, carbs_100g: e.per100.c, fat_100g: e.per100.f, fiber_100g: e.per100.fib }, { onConflict: 'user_id,key' });
            const kw = normFood(parseItem(desc).name);
            if (kw && !ctx.profile.myFoods?.some((f) => f.k.includes(kw))) await sb.from('personal_foods').insert({ name: e.name, keywords: [kw], per: '100g', grams: e.serving_g, kcal: e.per100.kcal, protein_g: e.per100.p, carbs_g: e.per100.c, fat_g: e.per100.f, fiber_g: e.per100.fib });
          }
          done.push({ id: e.id, date: row.date, label: s.label, kcal: s.kcal, protein: s.p });
        }
        return text({ estimated: done, skipped });
      });

      server.registerTool('log_food', {
        title: 'Log food', description: 'Log what the person ate, as they would type it ("2 chapati, 1 katori dal, 1 apple"). One call is one meal. Items the built-in table or their own foods know get numbers at once; anything else comes back with needs_estimate, so estimate it next with set_food_estimates.',
        inputSchema: z.object({ text: z.string().min(1).max(600), date: DateArg }),
      }, async ({ text: t, date }) => {
        const ctx = await ctxP, k = writeDay(ctx, date);
        return text({ date: k, logged: await logFoodText(sb, ctx, k, t) });
      });

      const measure = (field: 'weight_kg' | 'steps' | 'sleep_h', lo: number, hi: number, label: string) => async ({ value, date }: { value: number; date?: string }) => {
        const ctx = await ctxP, k = writeDay(ctx, date);
        if (!(value >= lo && value <= hi)) return fail(`${label} must be between ${lo} and ${hi}.`);
        must(await sb.from('day_logs').upsert({ date: k, [field]: field === 'steps' ? Math.round(value) : value }, { onConflict: 'user_id,date' }));
        return text({ date: k, [field]: value });
      };
      server.registerTool('log_weight', { title: 'Log weight', description: 'Morning weight in kg for a day.', inputSchema: z.object({ value: z.number(), date: DateArg }) }, measure('weight_kg', 20.1, 399, 'Weight'));
      server.registerTool('log_steps', { title: 'Log steps', description: "The day's total step count (replaces what is there).", inputSchema: z.object({ value: z.number(), date: DateArg }) }, measure('steps', 0, 200000, 'Steps'));
      server.registerTool('log_sleep', { title: 'Log sleep', description: 'Hours slept the night before, decimals allowed.', inputSchema: z.object({ value: z.number(), date: DateArg }) }, measure('sleep_h', 0, 24, 'Sleep'));

      server.registerTool('get_plan', {
        title: 'Get the plan', description: "The training plan (programs, the four phases and their weekly layouts), the goal's calorie and protein targets, the hard rules for any change, and the format propose_plan_change expects.",
        inputSchema: z.object({}), annotations: { readOnlyHint: true },
      }, async () => {
        const ctx = await ctxP, { D } = await daysFor(sb, ctx);
        const lw = D.series().filter((x) => x.w != null).pop()?.w ?? null;
        const rules = planRules(ctx.engine, ctx.profile, lw);
        return text({
          goal: { name: ctx.goal.name, kcal: ctx.goal.kcal, protein: ctx.goal.protein, start: ctx.goal.start, end: ctx.goal.due, latestKg: lw },
          day1Weekday: planWeekdays(ctx.engine.T.TSTART)[0], plan: compactPlan(ctx.engine.PL), source: ctx.engine.PL.by,
          // The same instructions the app's plan builder sends.
          how_to_propose: planPrompt('(what the person asked for)', rules, { weekdayOfDay1: planWeekdays(ctx.engine.T.TSTART)[0] }).replace(/Reply with ONLY JSON[\s\S]*$/, 'Then call propose_plan_change with request, summary, changes, goal {kcal, protein} and the full plan.'),
        });
      });

      server.registerTool('propose_plan_change', {
        title: 'Propose a plan change', description: 'Store a revised plan for the person to review. It is NOT applied: they see the changes in the app (Me, Your plan) and choose Use this plan or Discard. Send the whole plan in the get_plan format. Calories below the floor or protein below the protein floor are replaced with the current targets.',
        inputSchema: z.object({
          request: z.string().min(1).max(600).describe("What the person asked for, in their words"), summary: z.string().max(240),
          changes: z.array(z.string().max(160)).max(6), goal: z.object({ kcal: z.number(), protein: z.number() }), plan: z.record(z.string(), z.any()),
        }),
      }, async (a) => {
        const ctx = await ctxP;
        const pr = buildProposal({ summary: a.summary, changes: a.changes, goal: a.goal, plan: a.plan }, a.request, ctx.engine, ctx.profile, defaultPlanFor(ctx.goal, ctx.profile, ctx.engine.T.TMAINT_W));
        if (!pr) return fail('That plan does not fit the format: it needs 4 phases, each with one or two weeks of exactly 7 day slots, and programs with exercise lines "name|sets × reps". Call get_plan to see the format.');
        if (!pr.diff.length) return text('The proposal is the same as the current plan, so nothing was stored.');
        must(await sb.from('plan_proposals').insert({ origin: 'connector', summary: (pr.summary || a.request).slice(0, 400), body: pr.plan, kcal: pr.kcal, protein_g: pr.protein }));
        return text({ stored: true, note: 'The person can apply it in the Recomp app under Me, Your plan.', what_changes: pr.diff });
      });

      server.registerTool('save_weekly_review', {
        title: 'Save the weekly review', description: "Save a review of the last 7 days (from get_week_summary, following its review_instructions) so it shows on the person's Progress screen. At most one suggested change; a calorie or step change outside the rules is dropped. The person decides whether to apply it.",
        inputSchema: z.object({
          grade: z.string().max(2), headline: z.string().max(240), truths: z.array(z.string()).max(5), leak: z.string().max(260),
          commitments: z.array(z.string()).max(3), wins: z.array(z.string()).max(2),
          suggestion: z.object({ what: z.string().max(200), why: z.string().max(300), change: z.union([z.object({ kcal: z.number() }), z.object({ steps: z.number() }), z.null()]) }),
        }),
      }, async (o) => {
        const ctx = await ctxP, { D } = await daysFor(sb, ctx);
        const pfl = proteinFloor(ctx.profile, ctx.goal), kfl = kcalFloor(ctx.profile), end = ctx.maxDay;
        if (diffDays(d(ctx.engine.T.START), d(end)) < 6) return fail('A review needs at least a week of the plan.');
        const cur = D.weekStats(end, pfl), out = normReview(o, cur, ctx.engine.plan(end), ctx.goal, kfl);
        if (!out) return fail('A review needs at least a headline.');
        const ch = out.suggestion.change;
        must(await sb.from('reviews').upsert({ end_date: end, start_date: cur.from, stats: cur, out, change_kcal: ch && 'kcal' in ch ? ch.kcal : null, change_steps: ch && 'steps' in ch ? ch.steps : null, applied_at: null }, { onConflict: 'user_id,end_date' }));
        return text({ saved: true, kept_change: ch, note: o.suggestion.change && !ch ? 'The suggested change was outside the rules, so it was dropped.' : undefined });
      });

      return server;
    });
    return handler.fetch(req);
  }),
);
