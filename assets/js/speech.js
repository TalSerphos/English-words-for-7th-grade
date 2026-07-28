// speechSynthesis has two well-known traps: voices load asynchronously, and iOS
// refuses to speak until the first utterance follows a real user gesture.
const synth = window.speechSynthesis;

let voice = null;
let warmed = false;

export const supported = () => Boolean(synth);

function pickVoice() {
  if (!synth) return null;
  const voices = synth.getVoices();
  if (!voices.length) return null;
  return (
    voices.find((v) => v.lang === 'en-US' && v.localService) ??
    voices.find((v) => v.lang === 'en-US') ??
    voices.find((v) => v.lang === 'en-GB') ??
    voices.find((v) => v.lang?.startsWith('en')) ??
    null
  );
}

if (synth) {
  voice = pickVoice();
  synth.addEventListener?.('voiceschanged', () => {
    voice = pickVoice();
  });
}

// Call from the first user gesture: an empty utterance unlocks audio on iOS.
export function warmUp() {
  if (!synth || warmed) return;
  warmed = true;
  try {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    synth.speak(u);
  } catch {
    /* nothing to do — speak() will report the real failure */
  }
}

export function speak(text) {
  if (!synth) return false;
  try {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (!voice) voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'en-US';
    utterance.rate = 0.85;
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}
