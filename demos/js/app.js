document.addEventListener("DOMContentLoaded", () => {
  
  // 1. Efecto Scroll en la Barra de Navegación
  const navbar = document.getElementById("navbar");
  window.addEventListener("scroll", () => {
    if (window.scrollY > 60) {
      navbar.classList.add("scrolled");
    } else {
      navbar.classList.remove("scrolled");
    }
  }, { passive: true }); // Mejora el rendimiento del scroll

  // 2. Menú Móvil (Hamburguesa) con Accesibilidad ARIA
  const mobileBtn = document.getElementById("mobile-menu-btn");
  const navLinks = document.getElementById("nav-links");
  const links = navLinks.querySelectorAll("a");

  mobileBtn.addEventListener("click", () => {
    const isActive = navLinks.classList.toggle("active");
    // Actualizar estado para lectores de pantalla
    mobileBtn.setAttribute("aria-expanded", isActive);
  });

  // Cerrar el menú al hacer clic en un enlace (versión móvil)
  links.forEach(link => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 768) {
        navLinks.classList.remove("active");
        mobileBtn.setAttribute("aria-expanded", "false");
      }
    });
  });

  // 3. Inicialización de Mapa OpenStreetMap con Leaflet
  const coordenadasConsultorio = [22.1564, -100.9855]; 
  
  const map = L.map('map', {
    scrollWheelZoom: false // Evita acercarse por accidente al hacer scroll en la página
  }).setView(coordenadasConsultorio, 15);

  // Capa visual del mapa (Estilo de CartoDB acorde a la nueva paleta gris)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  // Añadir marcador personalizado
  const marker = L.marker(coordenadasConsultorio).addTo(map);
  marker.bindPopup(`
    <div style="color: #0f172a; font-family: 'DM Sans', sans-serif; text-align: center;">
      <b style="color: #334155; font-family: 'DM Serif Display', serif; font-size: 16px;">Dr. Miguel Mendoza</b><br>
      <span style="font-size: 13px;">Tequisquiapan, San Luis Potosí</span>
    </div>
  `).openPopup();

});