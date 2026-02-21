// Sets the html element background so the cannabis cultivation photo fills
// the viewport even in areas below Lovelace section grid content.
const style = document.createElement('style');
style.textContent = `
  html {
    background: #050b04 url('https://images.unsplash.com/photo-1536819114556-1e10f967fb61?w=1920&q=60&auto=format&fit=crop') center / cover fixed !important;
  }
`;
document.head.appendChild(style);
