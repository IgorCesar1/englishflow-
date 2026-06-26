/**
 * EnglishFlow Engine - Estrutura Modular
 */
const App = (() => {
  // Inicialização do PDF.js
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

  const init = () => {
    // Configura eventos das abas
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById('tab-' + e.target.dataset.tab).classList.add('active');
      };
    });

    // Evento de PDF
    document.getElementById('pdfFileInput').onchange = async (e) => {
      const file = e.target.files[0];
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      console.log("PDF carregado, total de páginas:", pdf.numPages);
      // Aqui entra o parser que extrai as linhas que discutimos
    };
  };

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
