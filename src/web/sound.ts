// sound.ts: short sound-effect playback via the Web Audio API, in place
// of HTMLAudioElement. A shared HTMLAudioElement, restarted from
// currentTime = 0 for every play, cuts itself off on overlapping or
// rapid-fire triggers (every card in a deal, both legs of a card-slide
// trade) and is prone to Safari specifically rejecting/delaying a
// play() that lands while a prior one is still settling -- it also
// makes Safari/macOS treat the page as playing media, surfacing a Now
// Playing widget the game has no use for. SoundEffect instead decodes
// its clip once, then hands out an independent AudioBufferSourceNode
// per play() so overlapping plays never race each other.

let sharedContext: AudioContext | undefined;

function context(): AudioContext {
  if (!sharedContext) {
    sharedContext = new AudioContext();
  }
  return sharedContext;
}

// resumeSoundsOnFirstGesture resumes the shared AudioContext on the
// page's first click or keypress. A new AudioContext starts (or is
// forced) suspended until a user gesture, under the same autoplay
// policy that blocks HTMLAudioElement.play() -- round 1's deal starts
// automatically, before the player has done anything, so without this
// the first sounds would be silent until the player happened to
// interact with something else first.
export function resumeSoundsOnFirstGesture(): void {
  const resume = () => {
    document.removeEventListener("click", resume);
    document.removeEventListener("keydown", resume);
    context()
      .resume()
      .catch((err: unknown) => console.warn("could not resume audio context", err));
  };
  document.addEventListener("click", resume, { once: true });
  document.addEventListener("keydown", resume, { once: true });
}

// SoundEffect is a single short clip, loaded and decoded once, that
// can be played any number of times -- including overlapping itself --
// without the plays interfering with each other.
export class SoundEffect {
  #buffer: Promise<AudioBuffer>;
  #active = new Set<AudioBufferSourceNode>();

  constructor(url: string) {
    this.#buffer = fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => context().decodeAudioData(data));
  }

  // play starts a new, independent playback of this clip. An
  // overlapping or rapid-fire call never cuts off or races a still-
  // playing one, since each gets its own AudioBufferSourceNode.
  play(): void {
    this.#buffer
      .then((buffer) => {
        const source = context().createBufferSource();
        source.buffer = buffer;
        source.connect(context().destination);
        source.addEventListener("ended", () => this.#active.delete(source));
        this.#active.add(source);
        source.start();
      })
      .catch((err: unknown) => console.warn("sound effect: play() failed", err));
  }

  // stop halts every currently-playing instance of this clip.
  stop(): void {
    for (const source of this.#active) {
      source.stop();
    }
    this.#active.clear();
  }
}
