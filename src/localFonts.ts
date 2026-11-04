// These faces are served only by the loopback development server from this PC's
// existing Hangeul installation. Font files are never bundled or exported.
export let equationFontAvailable = false;
export async function loadExamFonts() {
  // The installed Hangeul fonts are available only on the local dev server.
  // Public builds use the CSS system fallbacks and bundled KaTeX fonts.
  const faces = ['Batang', 'Dotum', 'Headline', 'Myeongjo', 'Equation'];
  const installed: Record<string, string[]> = {
    Batang: ['Haansoft Batang', '한컴바탕'],
    Dotum: ['Haansoft Dotum', '한컴돋움'],
    Headline: ['HY헤드라인M', 'H2hdrM'],
    Myeongjo: ['HY견명조', 'HYmjrE'],
    Equation: ['HyhwpEQ'],
  };
  await Promise.all(
    faces.map(async (name) => {
      try {
        const source = import.meta.env.DEV
          ? `url(/__exam_fonts/${name})`
          : installed[name].map((n) => `local("${n}")`).join(',');
        const face = new FontFace(`Exam ${name}`, source);
        document.fonts.add(await face.load());
        if (name === 'Equation') equationFontAvailable = true;
      } catch {
        /* Installed font unavailable: CSS uses the system fallback. */
      }
    }),
  );
}
