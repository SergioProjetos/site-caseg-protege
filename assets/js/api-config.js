(() => {
  let apiBaseUrl;

  switch (window.location.origin) {
    case "http://localhost:5500":
      apiBaseUrl = "http://localhost:3000";
      break;
    case "https://casegprotege.seg.br":
      apiBaseUrl = "https://api.casegprotege.seg.br";
      break;
    default:
      throw new Error("CASEG: origem não autorizada para configuração da API.");
  }

  window.CASEG_CONFIG = Object.freeze({
    API_BASE_URL: apiBaseUrl
  });
})();
