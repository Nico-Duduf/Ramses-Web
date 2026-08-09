import {
  clockText,
  deadlineText,
  frameCount,
  groupDigits,
  label,
  lastActivity,
  matchesSearch,
  shotSteps,
  showStrip,
  sinceText,
  sortSequences,
  sortShots,
  stateColor,
  stateTally,
  stepCompletion,
  taskFor,
  terminalStep,
  textOn,
} from "../format.js";

/** localStorage key prefix; the project uuid is appended. */
const STEP_KEY = "ramses.stripStep.";

export function projectView(store) {
  return {
    get data() {
      return store.current;
    },
    get steps() {
      return this.data ? shotSteps(this.data.steps) : [];
    },
    /** One column template shared by the summary bars, the sticky header and
     * every lane, so all three stay aligned with the steps they name. */
    get laneCols() {
      return `repeat(${this.steps.length}, minmax(0, 1fr))`;
    },
    get laneStyle() {
      return { gridTemplateColumns: this.laneCols };
    },
    /**
     * Narrowing the list, the same two controls Ramses-Client puts above its
     * shot table: a sequence to look in, and a string to look for.
     *
     * They AND together, as they do there. Selecting SQ010 and searching for a
     * shot in SQ020 therefore shows nothing, which is correct and briefly
     * confusing, so the empty state says which two things are in force.
     *
     * Neither touches the show strip or any completion figure. Those describe
     * the project; a number that changed while you typed would have stopped
     * describing anything.
     */
    seqFilter: "",
    search: "",
    /**
     * Which project the filters belong to.
     *
     * This component is created once and reused for every project, so without
     * this a sequence uuid chosen in one show stays selected in the next, where
     * it matches nothing: an empty shot list, no visible reason, and a picker
     * showing a sequence name that does not exist here. Driven from the
     * template by x-effect, so it follows whatever the router does.
     */
    filterProject: "",
    syncFilters(uuid) {
      if (!uuid || uuid === this.filterProject) return;
      this.filterProject = uuid;
      this.seqFilter = "";
      this.search = "";
    },
    get filtering() {
      return this.seqFilter !== "" || this.search.trim() !== "";
    },
    clearFilters() {
      this.seqFilter = "";
      this.search = "";
    },
    /** Sequences in configured order, each with its shots in natural order. */
    get allSequences() {
      if (!this.data) return [];
      return sortSequences(
        Object.entries(this.data.sequences).map(([uuid, seq]) => ({
          uuid,
          ...seq,
          shots: sortShots(
            Object.entries(this.data.shots)
              .filter(([, s]) => s.sequence === uuid)
              .map(([uuid, s]) => ({ uuid, ...s }))
          ),
        }))
      );
    },
    /**
     * The same list, narrowed for display.
     *
     * `shots` is what gets drawn; `allShots` is kept so the sequence heading can
     * go on describing the sequence rather than the search result. A heading
     * reading "SQ010, 1 shot" when SQ010 has twenty-seven of them would be a
     * plain lie about the show.
     */
    get sequences() {
      const seqs = this.allSequences
        .filter((seq) => this.seqFilter === "" || seq.uuid === this.seqFilter)
        .map((seq) => ({
          ...seq,
          allShots: seq.shots,
          shots: seq.shots.filter((s) => matchesSearch(s, this.search)),
        }));
      // An empty sequence heading with nothing under it is just a question the
      // page refuses to answer, so drop it. Only when filtering: a genuinely
      // empty sequence is worth seeing.
      return this.filtering ? seqs.filter((seq) => seq.shots.length) : seqs;
    },
    /** For the picker. Every sequence, whatever is currently selected. */
    get sequenceOptions() {
      return this.allSequences;
    },
    get matchCount() {
      return this.sequences.reduce((n, seq) => n + seq.shots.length, 0);
    },
    /** "No shots in SQ010 match "0570"", naming both filters in force. */
    get emptyText() {
      const seq = this.seqFilter ? this.data.sequences[this.seqFilter] : null;
      const where = seq ? `in ${label(seq)}` : "in this project";
      const what = this.search.trim() ? ` match "${this.search.trim()}"` : "";
      return `No shots ${where}${what}.`;
    },
    /** A shot's length in frames, at its own sequence's rate. */
    frames(shot) {
      return frameCount(shot, this.data.sequences[shot.sequence], this.data.project);
    },
    /** Bare number: the column it sits in is headed "Frames", so repeating
     * the unit on every row of forty is noise. The sequence and project
     * tallies keep their unit, because those run inline with other figures. */
    framesText(shot) {
      return groupDigits(this.frames(shot));
    },
    /** "27 shots / 2 105 f / 1:24" for a sequence or the whole project. */
    tally(shots, sequenceUuid) {
      const seq = sequenceUuid ? this.data.sequences[sequenceUuid] : null;
      const frames = shots.reduce(
        (sum, s) =>
          sum + frameCount(s, seq || this.data.sequences[s.sequence], this.data.project),
        0
      );
      const seconds = shots.reduce((sum, s) => sum + (s.duration || 0), 0);
      return `${shots.length} shots / ${groupDigits(frames)} f / ${clockText(seconds)}`;
    },
    get projectTally() {
      const shots = Object.entries(this.data.shots).map(([uuid, s]) => ({ uuid, ...s }));
      return this.tally(shots, null);
    },
    get deadline() {
      return deadlineText(this.data.project.deadline);
    },
    /** When anyone last touched this project, as opposed to when this page last
     * fetched it. Both are worth knowing, and they are not the same thing. */
    get lastChange() {
      const at = lastActivity(this.data.statuses);
      return at ? "Last change " + sinceText(at) : "";
    },
    /**
     * The shape of the remaining work at one step, in pipeline order.
     *
     * Each entry carries its state's own colour, so the tally and the lanes
     * below it are visibly the same information counted two ways.
     */
    tallyFor(stepUuid) {
      return stateTally(stepUuid, this.data).map((t) => ({
        count: t.count,
        name: label(t.state),
        color: stateColor(t.state),
      }));
    },
    /**
     * Which step colours the strip.
     *
     * Defaults to the end of the pipeline and can be changed per project,
     * because "done" means different things to different people: a modeller
     * wants Mod, a producer wants the delivery step. Remembered per project, so
     * the choice survives a reload but does not leak to other shows.
     */
    /**
     * The chosen step per project uuid.
     *
     * Reactive on purpose. The first version read localStorage directly inside
     * the getter, which stored the choice and updated the dropdown but left the
     * strip on its old colours until a reload: Alpine re-evaluates a getter when
     * something it tracks changes, and localStorage is not something it can
     * track. The store is the reactive copy; localStorage is only how it
     * survives a reload.
     */
    choices: {},
    get colourStepUuid() {
      const project = this.data.project.uuid;
      const chosen =
        this.choices[project] ?? window.localStorage.getItem(STEP_KEY + project);
      if (chosen && this.data.steps[chosen]) return chosen;
      const terminal = terminalStep(this.data.steps, this.data.pipes);
      return terminal ? terminal.uuid : "";
    },
    setColourStep(uuid) {
      this.choices[this.data.project.uuid] = uuid;
      window.localStorage.setItem(STEP_KEY + this.data.project.uuid, uuid);
    },
    get strip() {
      return showStrip(this.data, this.colourStepUuid);
    },
    /** The prose around the step picker, which completes the sentence. */
    get stripCaption() {
      return "Every shot, sized by length, coloured by";
    },
    openShot(uuid) {
      store.go("shot", uuid);
    },
    stepPercent(stepUuid) {
      const r = stepCompletion(stepUuid, this.data);
      return r === null ? "--" : r + "%";
    },
    stepWidth(stepUuid) {
      return (stepCompletion(stepUuid, this.data) ?? 0) + "%";
    },
    /**
     * One segment of a shot's lane.
     *
     * "Idle" covers both no task at all and the nothing-to-do state, because on
     * screen they mean the same thing: this step is not part of this shot's
     * work. Most shots are idle at most steps, so drawing them as full chips
     * buried the states that actually matter under a wall of "NO".
     */
    segment(shotUuid, stepUuid) {
      const task = taskFor(shotUuid, stepUuid, this.data.statuses);
      const state = task ? this.data.states[task.state] ?? null : null;
      const idle = !state || state.shortName === "NO";

      if (idle) return { idle: true, style: {}, label: "" };

      const bg = stateColor(state);
      return {
        idle: false,
        style: { backgroundColor: bg, color: textOn(bg) },
        label: label(state),
      };
    },
    open(shot) {
      store.go("shot", shot.uuid);
    },
    back() {
      store.go("projects");
    },
    label,
  };
}
