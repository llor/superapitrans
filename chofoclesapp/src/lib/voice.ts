// Reconocimiento de voz (Web Speech API) + TTS sistema.
// Pulsa botón → escucha mientras está pulsado → al soltar, cierra y
// devuelve el transcript. En Android moderno usa el motor de Google.

type RecognitionInstance = {
    start: () => void;
    stop: () => void;
    abort: () => void;
    onresult: ((e: any) => void) | null;
    onerror: ((e: any) => void) | null;
    onend: (() => void) | null;
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
};

type RecognitionCtor = new () => RecognitionInstance;

function getRecognitionCtor(): RecognitionCtor | null {
    const w = window as any;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isVoiceRecognitionSupported(): boolean {
    return !!getRecognitionCtor();
}

export type EscuchaCallbacks = {
    onTranscript: (texto: string, isFinal: boolean) => void;
    onError?: (err: string) => void;
    onEnd?: () => void;
};

export type EscuchaHandle = {
    stop: () => void;
};

export function escucharPulsando(cb: EscuchaCallbacks): EscuchaHandle | null {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
        cb.onError?.('Reconocimiento de voz no disponible en este dispositivo');
        return null;
    }
    const r = new Ctor();
    r.lang = 'es-ES';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    let detenido = false;

    r.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            const texto = res[0]?.transcript || '';
            cb.onTranscript(texto.trim(), res.isFinal);
        }
    };
    r.onerror = (e: any) => { cb.onError?.(e.error || 'recog_error'); };
    r.onend = () => { cb.onEnd?.(); };

    try { r.start(); }
    catch (e) {
        cb.onError?.(String(e));
        return null;
    }
    return {
        stop: () => {
            if (detenido) return;
            detenido = true;
            try { r.stop(); } catch { /* ignore */ }
        },
    };
}

// ---------------------- TTS ----------------------

let _vozEs: SpeechSynthesisVoice | null = null;
function elegirVozEs(): SpeechSynthesisVoice | null {
    if (_vozEs) return _vozEs;
    if (!('speechSynthesis' in window)) return null;
    const todas = window.speechSynthesis.getVoices();
    const candidatas = todas.filter(v => v.lang?.toLowerCase().startsWith('es'));
    _vozEs = candidatas[0] || todas[0] || null;
    return _vozEs;
}

export function hablar(texto: string, opts: { ratio?: number; volumen?: number } = {}): void {
    if (!texto) return;
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-ES';
    u.rate = opts.ratio ?? 1.0;
    u.volume = opts.volumen ?? 1.0;
    const voz = elegirVozEs();
    if (voz) u.voice = voz;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
}

export function callar(): void {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// ------------------- Mapa frase → comando --------------------

// Conjunto de patrones (se prueban en orden) → comando del backend.
// Tolerante a variaciones; si no hay match → null.
const PATRONES: { regex: RegExp; comando: string }[] = [
    { regex: /\b(acepto|aceptar|de\s*acuerdo|vale|s[ií]\s*lo\s*tomo)\b/i, comando: 'aceptar' },
    { regex: /\b(rechaz[ao]|no\s*lo\s*acepto|no\s*lo\s*tomo)\b/i, comando: 'rechazar' },
    { regex: /\b(en\s*camino|inici[oa]|salgo|arrancamos|en\s*marcha|vamos)\b/i, comando: 'en_camino' },
    { regex: /\b(llegu[eé]|llegado|estoy\s*aqu[ií]|he\s*llegado)\b/i, comando: 'llegado' },
    { regex: /\b(carga(do)?|ya\s*cargu[eé])\b/i, comando: 'cargado' },
    { regex: /\b(descarga(do)?|ya\s*descargu[eé]|entregad[oa])\b/i, comando: 'descargado' },
    { regex: /\b(termin(ar|ad[oa])|fin\s*del\s*viaje|finalizar)\b/i, comando: 'terminar' },
    { regex: /\b(cancel(ar|o|ad[oa]))\b/i, comando: 'cancelar' },
];

export function fraseAComando(frase: string): string | null {
    if (!frase) return null;
    for (const p of PATRONES) if (p.regex.test(frase)) return p.comando;
    return null;
}
