#!/usr/bin/env python3
"""Builds src/domain/data/exinfo.json and exindex.json from the Free Exercise DB
(https://github.com/yuhonas/free-exercise-db, public domain / Unlicense).

exinfo:  every exercise the app ships (lifts.json and altpool.json) -> the photo set that shows
         it (or the closest movement) and the muscles it works.
exindex: a compact index of the whole database, for exercises a custom plan brings in.
Usage: scripts/build-exinfo.py path/to/exercises.json
"""
import json, sys, os
root = os.path.join(os.path.dirname(__file__), '..', 'src', 'domain', 'data')
db = {e['id']: e for e in json.load(open(sys.argv[1]))}

# name -> (database id or None, exact?)  exact=False: a similar movement, labelled as such.
M = {
 'Assisted pull-up machine': ('Band_Assisted_Pull-Up', 0), 'Band W-pull': ('Face_Pull', 0), 'Band bent-over row': ('Bent_Over_Two-Dumbbell_Row', 0),
 'Band chop': ('Standing_Cable_Wood_Chop', 0), 'Band curl': ('Dumbbell_Bicep_Curl', 0), 'Band face pull': ('Face_Pull', 0),
 'Band lat pulldown, high door anchor': ('Wide-Grip_Lat_Pulldown', 0), 'Band overhead press': ('Shoulder_Press_-_With_Bands', 1), 'Band pull-apart': ('Band_Pull_Apart', 1),
 'Band pull-through': ('Pull_Through', 0), 'Band seated row, anchored at chest height': ('Seated_Cable_Rows', 0), 'Band standing chest press': ('Standing_Cable_Chest_Press', 0),
 'Band straight-arm pulldown': ('Straight-Arm_Pulldown', 0), 'Band triceps pushdown': ('Triceps_Pushdown', 0), 'Bent-over DB row, hand on chair': ('One-Arm_Dumbbell_Row', 1),
 'Cable chest press': ('Cable_Chest_Press', 1), 'Cable chop': ('Standing_Cable_Wood_Chop', 1), 'Cable curl': ('Standing_Biceps_Cable_Curl', 1),
 'Cable lateral raise': ('Cable_Seated_Lateral_Raise', 0), 'Cable pull-through': ('Pull_Through', 1), 'Cable shoulder press': ('Cable_Shoulder_Press', 1),
 'Calf raise on a step': ('Standing_Calf_Raises', 0), 'Chair sit-to-stand (DBs at chest when easy)': ('Chair_Squat', 0), 'Chair squat': ('Chair_Squat', 0),
 'Chest press machine': ('Leverage_Chest_Press', 1), 'Chest-supported DB row': ('Dumbbell_Incline_Row', 1), 'Close-grip machine press': ('Machine_Bench_Press', 0),
 'Close-grip pulldown': ('Close-Grip_Front_Lat_Pulldown', 1), 'Close-grip push-up on a counter': ('Incline_Push-Up_Close-Grip', 1), 'Cross-body hammer curl': ('Cross_Body_Hammer_Curl', 1),
 'DB Romanian deadlift': ('Stiff-Legged_Dumbbell_Deadlift', 0), 'DB Romanian deadlift, 3 s lowering': ('Stiff-Legged_Dumbbell_Deadlift', 0), 'DB curl': ('Dumbbell_Bicep_Curl', 1),
 'DB hammer curl': ('Hammer_Curls', 1), 'DB kickback, hand on chair': ('Tricep_Dumbbell_Kickback', 1), 'DB lateral raise': ('Side_Lateral_Raise', 1),
 'DB overhead extension': ('Standing_Dumbbell_Triceps_Extension', 1), 'DB sumo deadlift': ('Sumo_Deadlift', 0), 'Doorway isometric row hold': ('Inverted_Row', 0),
 'Face pull': ('Face_Pull', 1), 'Flat DB press': ('Dumbbell_Bench_Press', 1), 'Forty-five degree back extension': ('Hyperextensions_Back_Extensions', 1),
 'Glute bridge machine': ('Barbell_Glute_Bridge', 0), 'Goblet squat to box': ('Goblet_Squat', 0), 'Hack squat': ('Hack_Squat', 1),
 'Hack squat or goblet squat to box': ('Hack_Squat', 1), 'Half-kneeling band hold': ('Pallof_Press', 0), 'Hammer curl': ('Hammer_Curls', 1),
 'Hinged reverse DB fly': ('Reverse_Flyes', 0), 'Hip thrust': ('Barbell_Hip_Thrust', 1), 'Incline DB press': ('Incline_Dumbbell_Press', 1),
 'Incline plank, hands on a bench': ('Plank', 0), 'Incline push-up, hands on a counter': ('Incline_Push-Up', 1), 'Incline push-up, hands on a kitchen counter': ('Incline_Push-Up', 1),
 'Knee push-up on a counter': ('Incline_Push-Up', 0), 'Lat pulldown': ('Wide-Grip_Lat_Pulldown', 1), 'Leg extension': ('Leg_Extensions', 1), 'Leg press': ('Leg_Press', 1),
 'Leg-press calf press': ('Calf_Press_On_The_Leg_Press_Machine', 1), 'Low-box step-up with DBs': ('Dumbbell_Step_Ups', 1), 'Low-step step-up': ('Dumbbell_Step_Ups', 0),
 'Low-step step-up, hand on a chair': ('Dumbbell_Step_Ups', 0), 'Lying leg curl': ('Lying_Leg_Curls', 1), 'Machine lateral raise': ('Side_Lateral_Raise', 0),
 'Machine preacher curl': ('Machine_Preacher_Curls', 1), 'Machine row': ('Seated_Cable_Rows', 0), 'Overhead cable extension': ('Cable_Rope_Overhead_Triceps_Extension', 1),
 'Reverse lunge': ('Dumbbell_Rear_Lunge', 0), 'Reverse lunge to a chair': ('Dumbbell_Rear_Lunge', 0), 'Reverse lunge, hand on a chair': ('Dumbbell_Rear_Lunge', 0),
 'Reverse pec-deck': ('Reverse_Machine_Flyes', 1), 'Reverse plank on a bench': (None, 0), 'Rope pushdown': ('Triceps_Pushdown_-_Rope_Attachment', 1),
 'Rope triceps pushdown': ('Triceps_Pushdown_-_Rope_Attachment', 1), 'Seated Arnold press': ('Arnold_Dumbbell_Press', 1), 'Seated DB overhead extension': ('Seated_Triceps_Press', 1),
 'Seated DB shoulder press': ('Dumbbell_Shoulder_Press', 1), 'Seated cable row': ('Seated_Cable_Rows', 1), 'Seated calf raise': ('Seated_Calf_Raise', 1), 'Seated leg curl': ('Seated_Leg_Curl', 1),
 'Shoulder press machine': ('Machine_Shoulder_Military_Press', 1), 'Side plank on a bench': ('Side_Bridge', 0), 'Single-arm DB row': ('One-Arm_Dumbbell_Row', 1),
 'Single-arm band pulldown': ('One_Arm_Lat_Pulldown', 0), 'Single-arm band row': ('Seated_One-arm_Cable_Pulley_Rows', 0), 'Single-arm cable pulldown': ('One_Arm_Lat_Pulldown', 1),
 'Single-leg RDL, hand on chair': ('Stiff-Legged_Dumbbell_Deadlift', 0), 'Single-leg calf raise': ('Standing_Calf_Raises', 0), 'Smith machine squat': ('Smith_Machine_Squat', 1),
 'Split squat': ('Split_Squat_with_Dumbbells', 1), 'Split squat, hand on chair': ('Split_Squat_with_Dumbbells', 0), 'Standing DB press': ('Standing_Dumbbell_Press', 1),
 'Standing Pallof press': ('Pallof_Press', 1), 'Standing Pallof press, band at chest height': ('Pallof_Press', 1), 'Standing band side-bend hold': ('Dumbbell_Side_Bend', 0),
 'Standing calf raise': ('Standing_Calf_Raises', 1), 'Standing knee-to-elbow crunch': (None, 0), 'Standing march with arm drive': (None, 0), 'Standing plank on the wall': ('Plank', 0),
 'Suitcase carry': ('Farmers_Walk', 0), 'Suitcase hold': ('Farmers_Walk', 0), 'Suitcase hold, one DB at your side': ('Farmers_Walk', 0), 'Towel row on a door handle': ('Inverted_Row', 0),
 'Walking lunge': ('Bodyweight_Walking_Lunge', 1), 'Wall push-up': ('Incline_Push-Up', 0), 'Wall sit': (None, 0),
}
# Muscles by movement group (exgroup.json key before the dash), for when the photo's own list
# doesn't fit the movement or there's no photo. Names follow the database's muscle words.
G = {
 'squat': (['quadriceps', 'glutes'], ['hamstrings', 'adductors']), 'lunge': (['quadriceps', 'glutes'], ['hamstrings', 'adductors', 'calves']), 'quad': (['quadriceps'], []),
 'hinge': (['hamstrings', 'glutes'], ['lower back']), 'ham': (['hamstrings'], ['glutes', 'calves']), 'glute': (['glutes'], ['hamstrings']), 'calf': (['calves'], []),
 'hpush': (['chest'], ['triceps', 'shoulders']), 'vpush': (['shoulders'], ['triceps', 'traps']), 'hrow': (['middle back', 'lats'], ['biceps', 'shoulders']), 'vpull': (['lats'], ['biceps', 'middle back']),
 'reardelt': (['shoulders', 'middle back'], ['traps']), 'sidedelt': (['shoulders'], ['traps']), 'biceps': (['biceps'], ['forearms']), 'triceps': (['triceps'], []),
 'antiext': (['abdominals'], ['shoulders']), 'antirot': (['abdominals', 'obliques'], ['shoulders', 'glutes']), 'antilat': (['obliques', 'abdominals'], ['forearms', 'traps']),
}
OWN = {  # exercises with no group and no photo, or where the photo's list misleads
 'Wall sit': (['quadriceps'], ['glutes']), 'Standing march with arm drive': (['abdominals'], ['quadriceps', 'shoulders']), 'Standing knee-to-elbow crunch': (['abdominals'], ['quadriceps']),
 'Reverse plank on a bench': (['glutes', 'hamstrings'], ['shoulders', 'lower back']), 'Doorway isometric row hold': (['middle back', 'lats'], ['biceps']), 'Towel row on a door handle': (['middle back', 'lats'], ['biceps', 'forearms']),
 'Suitcase carry': (['obliques', 'abdominals'], ['forearms', 'traps']), 'Suitcase hold': (['obliques', 'abdominals'], ['forearms', 'traps']),
}
lifts = json.load(open(os.path.join(root, 'lifts.json'))); alt = json.load(open(os.path.join(root, 'altpool.json'))); grp = json.load(open(os.path.join(root, 'exgroup.json')))
names, altgroup = set(), {}
for v in lifts.values(): names.update(x.split('|')[0] for x in v)
for g, kits in alt.items():
    for xs in kits.values():
        for x in xs: names.add(x.split('|')[0]); altgroup[x.split('|')[0]] = g
out, bad = {}, []
for n in sorted(names):
    if n not in M: bad.append('unmapped: ' + n); continue
    id_, exact = M[n]
    if id_ and id_ not in db: bad.append(f'no such id: {id_} ({n})'); continue
    g = (grp.get(n) or altgroup.get(n) or '').split('-')[0]
    p, s = OWN.get(n) or G.get(g) or ((db[id_]['primaryMuscles'], db[id_]['secondaryMuscles']) if id_ else ([], []))
    e = {'p': p, 's': s}
    if id_: e['img'] = id_; e['n'] = len(db[id_]['images'])
    if id_ and not exact: e['like'] = db[id_]['name']
    out[n] = e
if bad: print('\n'.join(bad)); sys.exit(1)
json.dump(out, open(os.path.join(root, 'exinfo.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
idx = [[e['id'], e['name'], e['primaryMuscles'], e['secondaryMuscles']] for e in db.values() if len(e['images']) >= 2]
json.dump(idx, open(os.path.join(root, 'exindex.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(out), 'exercises;', sum(1 for e in out.values() if 'img' in e), 'with photos;', len(idx), 'in the index')
