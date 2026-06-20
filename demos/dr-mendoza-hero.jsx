import { useState } from "react";

/* ─── Constants ─────────────────────────────────────────── */
const BG        = "#0A5C42";
const BG_DARK   = "#073D2C";
const ACCENT    = "#7ECFC0";
const IMG       = "https://aphernzz.com/demos/img/doctor-miguel.jpg";
const LOGO      = "https://aphernzz.com/demos/img/logo-doctor-miguel-01.png";
const NAV_LINKS = ["Casos de éxito", "Sobre mí", "Contacto", "Artículos"];

/* ─── Topographic texture ────────────────────────────────── */
function TopoSVG() {
  return (
    <svg
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        opacity: 0.065, pointerEvents: "none",
      }}
    >
      <defs>
        <pattern id="topo" x="0" y="0" width="160" height="160" patternUnits="userSpaceOnUse">
          {/* Organic concentric-ish curves */}
          <path d="M0 55 C25 35, 55 25, 80 45 C105 65, 135 55, 160 40" fill="none" stroke="white" strokeWidth="1.2"/>
          <path d="M0 90 C30 70, 65 60, 90 78 C115 96, 140 88, 160 72" fill="none" stroke="white" strokeWidth="1.2"/>
          <path d="M0 125 C35 105, 70 95, 95 112 C120 129, 145 120, 160 105" fill="none" stroke="white" strokeWidth="1"/>
          <path d="M0 160 C40 140, 75 130, 100 147 C125 164, 148 155, 160 140" fill="none" stroke="white" strokeWidth="0.9"/>
          <path d="M20 0 C10 25, 5 60, 22 85 C39 110, 35 140, 20 160" fill="none" stroke="white" strokeWidth="1"/>
          <path d="M75 0 C62 28, 58 65, 75 90 C92 115, 88 142, 73 160" fill="none" stroke="white" strokeWidth="1"/>
          <path d="M130 0 C118 30, 115 68, 132 93 C149 118, 145 145, 130 160" fill="none" stroke="white" strokeWidth="0.9"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#topo)" />
    </svg>
  );
}

/* ─── Calendar icon ──────────────────────────────────────── */
function CalIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

/* ─── Star rating ────────────────────────────────────────── */
function Stars() {
  return (
    <div style={{ display: "flex", gap: 1 }}>
      {[...Array(5)].map((_, i) => (
        <svg key={i} width="13" height="13" viewBox="0 0 24 24" fill="#FBBF24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      ))}
    </div>
  );
}

/* ─── Fake avatar circles ────────────────────────────────── */
const AVATAR_COLORS = ["#1E8C6E", "#12705A", "#0A5C47"];
function Avatars() {
  return (
    <div style={{ display: "flex", marginRight: 12 }}>
      {["P", "R", "M"].map((l, i) => (
        <div key={i} style={{
          width: 34, height: 34, borderRadius: "50%",
          backgroundColor: AVATAR_COLORS[i],
          border: "2.5px solid rgba(255,255,255,0.35)",
          marginLeft: i === 0 ? 0 : -10,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: 700,
        }}>{l}</div>
      ))}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────── */
export default function DrMendozaHero() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{
      minHeight: "100vh", background: "#E5E7EB",
      padding: "12px", display: "flex",
      flexDirection: "column", alignItems: "center",
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    }}>
      {/* ── Card container ── */}
      <div style={{
        width: "100%", maxWidth: 1280,
        borderRadius: 28, overflow: "hidden",
        position: "relative",
        backgroundColor: BG,
        minHeight: "92vh",
        display: "flex", flexDirection: "column",
      }}>
        <TopoSVG />

        {/* subtle radial glow bottom-right */}
        <div style={{
          position: "absolute", bottom: 0, right: "15%",
          width: 480, height: 480,
          background: `radial-gradient(ellipse at center, rgba(14,110,100,0.45) 0%, transparent 70%)`,
          pointerEvents: "none", zIndex: 1,
        }} />

        {/* ── NAV ── */}
        <div style={{ position: "relative", zIndex: 30, padding: "18px 24px 0", display: "flex", justifyContent: "center" }}>
          <nav style={{
            background: "white", borderRadius: 999,
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            display: "flex", alignItems: "center",
            width: "100%", maxWidth: 780,
            padding: "8px 16px",
            gap: 0,
          }}>
            {/* Avatar + name */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <img src={IMG} alt="Dr. Miguel"
                style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", objectPosition: "top center", border: "2px solid #E5F4F0" }}
              />
              <span style={{ fontWeight: 600, fontSize: 13.5, color: "#1A2A25", whiteSpace: "nowrap" }}>
                Dr. Miguel Mendoza
              </span>
            </div>

            {/* Desktop links */}
            <div className="nav-links-desktop" style={{ display: "flex", gap: 28, marginLeft: "auto", marginRight: 4 }}>
              {NAV_LINKS.map(l => (
                <a key={l} href="#"
                  style={{ fontSize: 13, color: "#5A7068", fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" }}
                  onMouseEnter={e => (e.target.style.color = BG)}
                  onMouseLeave={e => (e.target.style.color = "#5A7068")}
                >{l}</a>
              ))}
            </div>

            {/* Hamburger (shown via CSS on mobile) */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="hamburger-btn"
              style={{
                marginLeft: "auto", background: "none", border: "none",
                cursor: "pointer", padding: 6, display: "none",
                flexDirection: "column", gap: 5,
              }}
            >
              {[0,1,2].map(i => (
                <span key={i} style={{ display: "block", width: 20, height: 2, background: "#333", borderRadius: 2 }} />
              ))}
            </button>
          </nav>

          {/* Mobile menu dropdown */}
          {menuOpen && (
            <div style={{
              position: "absolute", top: "100%", left: 24, right: 24,
              background: "white", borderRadius: 16, marginTop: 6,
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)", overflow: "hidden", zIndex: 40,
            }}>
              {NAV_LINKS.map((l, i) => (
                <a key={l} href="#" style={{
                  display: "block", padding: "14px 20px",
                  fontSize: 14, color: "#1A2A25", fontWeight: 500,
                  textDecoration: "none",
                  borderBottom: i < NAV_LINKS.length - 1 ? "1px solid #F0F4F3" : "none",
                }}>{l}</a>
              ))}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════
            DESKTOP HERO  (hidden on mobile via CSS class)
        ═══════════════════════════════════════ */}
        <div className="hero-desktop" style={{
          position: "relative", zIndex: 10,
          display: "flex", flex: 1,
          padding: "0 5% 0 5%",
        }}>
          {/* LEFT COLUMN — 55% */}
          <div style={{
            width: "55%", display: "flex", flexDirection: "column",
            justifyContent: "flex-end", paddingBottom: "5rem",
            paddingTop: "3rem", paddingRight: "3rem",
          }}>
            {/* Badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
              color: "rgba(255,255,255,0.92)", fontSize: 11, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.1em",
              padding: "7px 16px", borderRadius: 999,
              width: "fit-content", marginBottom: 32,
            }}>
              {/* pulse dot */}
              <span style={{
                display: "block", width: 7, height: 7, borderRadius: "50%",
                background: ACCENT, flexShrink: 0,
                animation: "pulse 2s ease-in-out infinite",
              }} />
              Dr. Miguel Mendoza · SLP
            </div>

            {/* Headline */}
            <div style={{
              fontSize: "clamp(2.6rem, 3.6vw, 3.9rem)",
              fontWeight: 800, lineHeight: 1.04,
              color: "white", letterSpacing: "-0.03em",
              marginBottom: 36,
            }}>
              <div>Salud vascular</div>
              <div>con <span style={{ color: ACCENT }}>precisión</span></div>
              <div>y confianza</div>
            </div>

            {/* Avatars + Rating */}
            <div style={{
              display: "flex", alignItems: "center",
              paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.1)",
            }}>
              <Avatars />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Stars />
                  <span style={{ color: "white", fontWeight: 700, fontSize: 13 }}>5.0</span>
                </div>
                <div style={{ color: "rgba(255,255,255,0.48)", fontSize: 11.5, marginTop: 3 }}>
                  +180 pacientes satisfechos
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN — 45% */}
          <div style={{ width: "45%", display: "flex", alignSelf: "stretch" }}>
            {/* Doctor photo — 58% of right col */}
            <div style={{ flex: "0 0 58%", position: "relative" }}>
              <img
                src={IMG}
                alt="Dr. Miguel Mendoza"
                style={{
                  position: "absolute", bottom: 0, left: 0,
                  width: "100%", height: "88%",
                  objectFit: "cover", objectPosition: "top center",
                  maskImage: "linear-gradient(to bottom, black 45%, transparent 92%)",
                  WebkitMaskImage: "linear-gradient(to bottom, black 45%, transparent 92%)",
                }}
              />
            </div>

            {/* Text + CTA — 42% of right col */}
            <div style={{
              flex: "0 0 42%", display: "flex", flexDirection: "column",
              justifyContent: "flex-end", paddingBottom: "5rem", paddingLeft: "1.25rem",
            }}>
              <p style={{
                color: "rgba(255,255,255,0.62)", fontSize: 13.5,
                lineHeight: 1.75, marginBottom: 24,
              }}>
                Especialista en diagnóstico y tratamiento integral de enfermedades venosas y arteriales periféricas. Ultrasonido Doppler incluido en cada consulta.
              </p>
              <a href="https://wa.me/524447138417" style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                background: "white", color: "#1A2A25",
                fontWeight: 700, fontSize: 13.5,
                padding: "13px 22px", borderRadius: 999,
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                textDecoration: "none", width: "fit-content", whiteSpace: "nowrap",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.28)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.2)"; }}
              >
                <CalIcon size={15} />
                Reservar consulta
              </a>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════
            MOBILE HERO  (hidden on desktop via CSS class)
        ═══════════════════════════════════════ */}
        <div className="hero-mobile" style={{ position: "relative", zIndex: 10, flex: 1, display: "none", flexDirection: "column" }}>
          {/* Full-bleed photo */}
          <div style={{ position: "relative", width: "100%", height: 300, flexShrink: 0 }}>
            <img
              src={IMG}
              alt="Dr. Miguel Mendoza"
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }}
            />
            {/* fade to bg */}
            <div style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(to bottom, transparent 30%, ${BG} 88%)`,
            }} />
          </div>

          {/* Content below photo */}
          <div style={{ padding: "0 22px 40px", marginTop: -48, position: "relative" }}>
            {/* Badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
              color: "rgba(255,255,255,0.88)", fontSize: 10.5, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.1em",
              padding: "6px 14px", borderRadius: 999, marginBottom: 20,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, flexShrink: 0 }} />
              Cirujano Vascular · SLP
            </div>

            {/* Headline */}
            <div style={{
              fontSize: "2.1rem", fontWeight: 800, lineHeight: 1.06,
              color: "white", letterSpacing: "-0.03em", marginBottom: 28,
            }}>
              <div>Salud vascular</div>
              <div>con <span style={{ color: ACCENT }}>precisión</span></div>
              <div>y confianza</div>
            </div>

            {/* CTA full-width */}
            <a href="https://wa.me/524447138417" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              background: "white", color: "#1A2A25",
              fontWeight: 700, fontSize: 14,
              padding: "15px 24px", borderRadius: 999,
              boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
              textDecoration: "none", width: "100%",
            }}>
              <CalIcon size={16} />
              Reservar consulta
            </a>

            {/* Reviews row below CTA */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20, paddingLeft: 4 }}>
              <Avatars />
              <div>
                <Stars />
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 2 }}>+180 pacientes satisfechos</div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Responsive styles via <style> ── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.5); }
        }
        @media (max-width: 767px) {
          .hero-desktop       { display: none !important; }
          .hero-mobile        { display: flex !important; }
          .nav-links-desktop  { display: none !important; }
          .hamburger-btn      { display: flex !important; }
        }
        @media (min-width: 768px) {
          .hero-desktop       { display: flex !important; }
          .hero-mobile        { display: none !important; }
          .hamburger-btn      { display: none !important; }
        }
      `}</style>
    </div>
  );
}
