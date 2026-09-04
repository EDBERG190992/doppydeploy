// Hamburger menu
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');
hamburger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});

// Scroll fade-in
const fadeEls = document.querySelectorAll('.fade-in');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(el => {
    if (el.isIntersecting) {
      el.target.classList.add('visible');
      observer.unobserve(el.target);
    }
  });
}, { threshold: 0.1 });
fadeEls.forEach(el => observer.observe(el));

// Animate chart bars on scroll
const bars = document.querySelectorAll('.bar');
bars.forEach((bar, i) => {
  bar.style.transition = `height 0.6s ease ${i * 0.08}s, opacity 0.3s`;
});

// Chart bar hover
bars.forEach(bar => {
  bar.addEventListener('mouseenter', () => bar.style.opacity = '1');
  bar.addEventListener('mouseleave', () => {
    if (!bar.classList.contains('active')) bar.style.opacity = '0.15';
  });
});