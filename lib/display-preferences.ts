// Chaves das preferências de leitura do portal (tema e tamanho da fonte).
// Fica fora do componente cliente para o layout do servidor usar o script.
export const themeKey = 'ufaprova-theme';
export const fontKey = 'ufaprova-font-scale';
export const maxFontScale = 2;

// Aplica as preferências antes da pintura, só nas áreas logadas (o tema escuro
// não vale para a página inicial pública).
export const displayPreferencesScript = `try{var p=location.pathname;if(/^\\/(portal|configuracoes)(\\/|$)/.test(p)){var r=document.documentElement;if(localStorage.getItem('${themeKey}')==='dark')r.classList.add('dark');var f=Number(localStorage.getItem('${fontKey}'))||0;if(f>0&&f<=${maxFontScale})r.dataset.fontScale=String(f);}}catch(e){}`;
