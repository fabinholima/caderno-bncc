-- Restore the 54 component-specific Língua Portuguesa skills missing from
-- the Ensino Médio catalog. Text and provenance were checked against the MEC
-- official workbook export BNCC_Ensino_Medio.xlsx (23/06/2023; SHA-256
-- f89493a6dcc8315a1803e0cbaa5966e582e13733798175fd3c5485c0c0dd4127),
-- with the homologated BNCC PDF as the text authority.
-- Normalized catalog provenance: bncc.dev (Profy), CC BY 4.0,
-- https://github.com/bncc-dev/bncc-dados (commit 9c268978efa2aa250834c6a9edb6074432752838).
-- Existing skill IDs and their question references are preserved.

WITH official_skills(code, description, source_metadata) AS (
VALUES
  ('EM13LP01', 'Relacionar o texto, tanto na produção como na leitura/escuta, com suas condições de produção e seu contexto sócio-histórico de circulação (leitor/audiência previstos, objetivos, pontos de vista e perspectivas, papel social do autor, época, gênero do discurso etc.), de forma a ampliar as possibilidades de construção de sentidos e de análise crítica e produzir textos adequados a diferentes situações.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 3","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 508","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP02', 'Estabelecer relações entre as partes do texto, tanto na produção como na leitura/escuta, considerando a construção composicional e o estilo do gênero, usando/reconhecendo adequadamente elementos e recursos coesivos diversos que contribuam para a coerência, a continuidade do texto e sua progressão temática, e organizando informações, tendo em vista as condições de produção e as relações lógico-discursivas envolvidas (causa/efeito ou consequência; tese/argumentos; problema/solução; definição/exemplos etc.).', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 4","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 508","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP03', 'Analisar relações de intertextualidade e interdiscursividade que permitam a explicitação de relações dialógicas, a identificação de posicionamentos ou de perspectivas, a compreensão de paráfrases, paródias e estilizações, entre outras possibilidades.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 5","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 508","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP04', 'Estabelecer relações de interdiscursividade e intertextualidade para explicitar, sustentar e conferir consistência a posicionamentos e para construir e corroborar explicações e relatos, fazendo uso de citações e paráfrases devidamente marcadas.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 6","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 508","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP05', 'Analisar, em textos argumentativos, os posicionamentos assumidos, os movimentos argumentativos (sustentação, refutação/contra-argumentação e negociação) e os argumentos utilizados para sustentá-los, para avaliar sua força e eficácia, e posicionar-se criticamente diante da questão discutida e/ou dos argumentos utilizados, recorrendo aos mecanismos linguísticos necessários.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 7","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 509","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP06', 'Analisar efeitos de sentido decorrentes de usos expressivos da linguagem, da escolha de determinadas palavras ou expressões e da ordenação, combinação e contraposição de palavras, dentre outros, para ampliar as possibilidades de construção de sentidos e de uso crítico da língua.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 8","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 509","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP07', 'Analisar, em textos de diferentes gêneros, marcas que expressam a posição do enunciador frente àquilo que é dito: uso de diferentes modalidades (epistêmica, deôntica e apreciativa) e de diferentes recursos gramaticais que operam como modalizadores (verbos modais, tempos e modos verbais, expressões modais, adjetivos, locuções ou orações adjetivas, advérbios, locuções ou orações adverbiais, entonação etc.), uso de estratégias de impessoalização (uso de terceira pessoa e de voz passiva etc.), com vistas ao incremento da compreensão e da criticidade e ao manejo adequado desses elementos nos textos produzidos, considerando os contextos de produção.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 9","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 509","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP08', 'Analisar elementos e aspectos da sintaxe do português, como a ordem dos constituintes da sentença (e os efeito que causam sua inversão), a estrutura dos sintagmas, as categorias sintáticas, os processos de coordenação e subordinação (e os efeitos de seus usos) e a sintaxe de concordância e de regência, de modo a potencializar os processos de compreensão e produção de textos e a possibilitar escolhas adequadas à situação comunicativa.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 10","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 509","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP09', 'Comparar o tratamento dado pela gramática tradicional e pelas gramáticas de uso contemporâneas em relação a diferentes tópicos gramaticais, de forma a perceber as diferenças de abordagem e o fenômeno da variação linguística e analisar motivações que levam ao predomínio do ensino da norma-padrão na escola.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 11","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 509","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP10', 'Analisar o fenômeno da variação linguística, em seus diferentes níveis (variações fonético-fonológica, lexical, sintática, semântica e estilístico-pragmática) e em suas diferentes dimensões (regional, histórica, social, situacional, ocupacional, etária etc.), de forma a ampliar a compreensão sobre a natureza viva e dinâmica da língua e sobre o fenômeno da constituição de variedades linguísticas de prestígio e estigmatizadas, e a fundamentar o respeito às variedades linguísticas e o combate a preconceitos linguísticos.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 12","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 510","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP11', 'Fazer curadoria de informação, tendo em vista diferentes propósitos e projetos discursivos.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 13","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 510","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP12', 'Selecionar informações, dados e argumentos em fontes confiáveis, impressas e digitais, e utilizá-los de forma referenciada, para que o texto a ser produzido tenha um nível de aprofundamento adequado (para além do senso comum) e contemple a sustentação das posições defendidas.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 14","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 510","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP13', 'Analisar, a partir de referências contextuais, estéticas e culturais, efeitos de sentido decorrentes de escolhas de elementos sonoros (volume, timbre, intensidade, pausas, ritmo, efeitos sonoros, sincronização etc.) e de suas relações com o verbal, levando-os em conta na produção de áudios, para ampliar as possibilidades de construção de sentidos e de apreciação.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 15","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 510","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP14', 'Analisar, a partir de referências contextuais, estéticas e culturais, efeitos de sentido decorrentes de escolhas e composição das imagens (enquadramento, ângulo/vetor, foco/profundidade de campo, iluminação, cor, linhas, formas etc.) e de sua sequenciação (disposição e transição, movimentos de câmera, remix, entre outros), das performances (movimentos do corpo, gestos, ocupação do espaço cênico), dos elementos sonoros (entonação, trilha sonora, sampleamento etc.) e das relações desses elementos com o verbal, levando em conta esses efeitos nas produções de imagens e vídeos, para ampliar as possibilidades de construção de sentidos e de apreciação.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 16","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 510","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP15', 'Planejar, produzir, revisar, editar, reescrever e avaliar textos escritos e multissemióticos, considerando sua adequação às condições de produção do texto, no que diz respeito ao lugar social a ser assumido e à imagem que se pretende passar a respeito de si mesmo, ao leitor pretendido, ao veículo e mídia em que o texto ou produção cultural vai circular, ao contexto imediato e sócio-histórico mais geral, ao gênero textual em questão e suas regularidades, à variedade linguística apropriada a esse contexto e ao uso do conhecimento dos aspectos notacionais (ortografia padrão, pontuação adequada, mecanismos de concordância nominal e verbal, regência verbal etc.), sempre que o contexto o exigir.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 17","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 511","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP16', 'Produzir e analisar textos orais, considerando sua adequação aos contextos de produção, à forma composicional e ao estilo do gênero em questão, à clareza, à progressão temática e à variedade linguística empregada, como também aos elementos relacionados à fala (modulação de voz, entonação, ritmo, altura e intensidade, respiração etc.) e à cinestesia (postura corporal, movimentos e gestualidade significativa, expressão facial, contato de olho com plateia etc.).', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 18","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 511","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP17', 'Elaborar roteiros para a produção de vídeos variados (vlog, videoclipe, videominuto, documentário etc.), apresentações teatrais, narrativas multimídia e transmídia, podcasts, playlists comentadas etc., para ampliar as possibilidades de produção de sentidos e engajar-se em práticas autorais e coletivas.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 19","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 511","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP18', 'Utilizar softwares de edição de textos, fotos, vídeos e áudio, além de ferramentas e ambientes colaborativos para criar textos e produções multissemióticas com finalidades diversas, explorando os recursos e efeitos disponíveis e apropriando-se de práticas colaborativas de escrita, de construção coletiva do conhecimento e de desenvolvimento de projetos.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 20","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 511","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP19', 'Apresentar-se por meio de textos multimodais diversos (perfis variados, gifs biográficos, biodata, currículo web, videocurrículo etc.) e de ferramentas digitais (ferramenta de gif, wiki, site etc.), para falar de si mesmo de formas variadas, considerando diferentes situações e objetivos.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 21","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 513","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP20', 'Compartilhar gostos, interesses, práticas culturais, temas/ problemas/questões que despertam maior interesse ou preocupação, respeitando e valorizando diferenças, como forma de identificar afinidades e interesses comuns, como também de organizar e/ou participar de grupos, clubes, oficinas e afins.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 22","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 513","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP21', 'Produzir, de forma colaborativa, e socializar playlists comentadas de preferências culturais e de entretenimento, revistas culturais, fanzines, e-zines ou publicações afins que divulguem, comentem e avaliem músicas, games, séries, filmes, quadrinhos, livros, peças, exposições, espetáculos de dança etc., de forma a compartilhar gostos, identificar afinidades, fomentar comunidades etc.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 23","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 513","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP22', 'Construir e/ou atualizar, de forma colaborativa, registros dinâmicos (mapas, wiki etc.) de profissões e ocupações de seu interesse (áreas de atuação, dados sobre formação, fazeres, produções, depoimentos de profissionais etc.) que possibilitem vislumbrar trajetórias pessoais e profissionais.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 24","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 513","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP23', 'Analisar criticamente o histórico e o discurso político de candidatos, propagandas políticas, políticas públicas, programas e propostas de governo, de forma a participar do debate político e tomar decisões conscientes e fundamentadas.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 25","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 516","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP24', 'Analisar formas não institucionalizadas de participação social, sobretudo as vinculadas a manifestações artísticas, produções culturais, intervenções urbanas e formas de expressão típica das culturas juvenis que pretendam expor uma problemática ou promover uma reflexão/ação, posicionando-se em relação a essas produções e manifestações.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 26","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 516","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP25', 'Participar de reuniões na escola (conselho de escola e de classe, grêmio livre etc.), agremiações, coletivos ou movimentos, entre outros, em debates, assembleias, fóruns de discussão etc., exercitando a escuta atenta, respeitando seu turno e tempo de fala, posicionando-se de forma fundamentada, respeitosa e ética diante da apresentação de propostas e defesas de opiniões, usando estratégias linguísticas típicas de negociação e de apoio e/ou de consideração do discurso do outro (como solicitar esclarecimento, detalhamento, fazer referência direta ou retomar a fala do outro, parafraseando-a para endossá-la, enfatizá-la, complementá-la ou enfraquecê-la), considerando propostas alternativas e reformulando seu posicionamento, quando for caso, com vistas ao entendimento e ao bem comum.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 27","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 516","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP26', 'Relacionar textos e documentos legais e normativos de âmbito universal, nacional, local ou escolar que envolvam a definição de direitos e deveres - em especial, os voltados a adolescentes e jovens - aos seus contextos de produção, identificando ou inferindo possíveis motivações e finalidades, como forma de ampliar a compreensão desses direitos e deveres.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 28","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 516","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP27', 'Engajar-se na busca de solução para problemas que envolvam a coletividade, denunciando o desrespeito a direitos, organizando e/ou participando de discussões, campanhas e debates, produzindo textos reivindicatórios, normativos, entre outras possibilidades, como forma de fomentar os princípios democráticos e uma atuação pautada pela ética da responsabilidade, pelo consumo consciente e pela consciência socioambiental.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 29","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 516","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP28', 'Organizar situações de estudo e utilizar procedimentos e estratégias de leitura adequados aos objetivos e à natureza do conhecimento em questão.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 30","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 519","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP29', 'Resumir e resenhar textos, por meio do uso de paráfrases, de marcas do discurso reportado e de citações, para uso em textos de divulgação de estudos e pesquisas.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 31","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 519","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP30', 'Realizar pesquisas de diferentes tipos (bibliográfica, de campo, experimento científico, levantamento de dados etc.), usando fontes abertas e confiáveis, registrando o processo e comunicando os resultados, tendo em vista os objetivos pretendidos e demais elementos do contexto de produção, como forma de compreender como o conhecimento científico é produzido e apropriar-se dos procedimentos e dos gêneros textuais envolvidos na realização de pesquisas.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 32","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 519","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP31', 'Compreender criticamente textos de divulgação científica orais, escritos e multissemióticos de diferentes áreas do conhecimento, identificando sua organização tópica e a hierarquização das informações, identificando e descartando fontes não confiáveis e problematizando enfoques tendenciosos ou superficiais.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 33","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 519","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP32', 'Selecionar informações e dados necessários para uma dada pesquisa (sem excedê-los) em diferentes fontes (orais, impressas, digitais etc.) e comparar autonomamente esses conteúdos, levando em conta seus contextos de produção, referências e índices de confiabilidade, e percebendo coincidências, complementaridades, contradições, erros ou imprecisões conceituais e de dados, de forma a compreender e posicionar-se criticamente sobre esses conteúdos e estabelecer recortes precisos.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 34","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 519","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP33', 'Selecionar, elaborar e utilizar instrumentos de coleta de dados e informações (questionários, enquetes, mapeamentos, opinários) e de tratamento e análise dos conteúdos obtidos, que atendam adequadamente a diferentes objetivos de pesquisa.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 35","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 520","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP34', 'Produzir textos para a divulgação do conhecimento e de resultados de levantamentos e pesquisas - texto monográfico, ensaio, artigo de divulgação científica, verbete de enciclopédia (colaborativa ou não), infográfico (estático ou animado), relato de experimento, relatório, relatório multimidiático de campo, reportagem científica, podcast ou vlog científico, apresentações orais, seminários, comunicações em mesas redondas, mapas dinâmicos etc. -, considerando o contexto de produção e utilizando os conhecimentos sobre os gêneros de divulgação científica, de forma a engajar-se em processos significativos de socialização e divulgação do conhecimento.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 36","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 520","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP35', 'Utilizar adequadamente ferramentas de apoio a apresentações orais, escolhendo e usando tipos e tamanhos de fontes que permitam boa visualização, topicalizando e/ou organizando o conteúdo em itens, inserindo de forma adequada imagens, gráficos, tabelas, formas e elementos gráficos, dimensionando a quantidade de texto e imagem por slide e usando, de forma harmônica, recursos (efeitos de transição, slides mestres, layouts personalizados, gravação de áudios em slides etc.).', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 37","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 520","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP36', 'Analisar os interesses que movem o campo jornalístico, os impactos das novas tecnologias digitais de informação e comunicação e da Web 2.0 no campo e as condições que fazem da informação uma mercadoria e da checagem de informação uma prática (e um serviço) essencial, adotando atitude analítica e crítica diante dos textos jornalísticos.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 38","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 523","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP37', 'Conhecer e analisar diferentes projetos editorias - institucionais, privados, públicos, financiados, independentes etc. -, de forma a ampliar o repertório de escolhas possíveis de fontes de informação e opinião, reconhecendo o papel da mídia plural para a consolidação da democracia.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 39","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 523","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP38', 'Analisar os diferentes graus de parcialidade/imparcialidade (no limite, a não neutralidade) em textos noticiosos, comparando relatos de diferentes fontes e analisando o recorte feito de fatos/dados e os efeitos de sentido provocados pelas escolhas realizadas pelo autor do texto, de forma a manter uma atitude crítica diante dos textos jornalísticos e tornar-se consciente das escolhas feitas como produtor.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 40","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 523","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP39', 'Usar procedimentos de checagem de fatos noticiados e fotos publicadas (verificar/avaliar veículo, fonte, data e local da publicação, autoria, URL, formatação; comparar diferentes fontes; consultar ferramentas e sites checadores etc.), de forma a combater a proliferação de notícias falsas (fake news).', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 41","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 523","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP40', 'Analisar o fenômeno da pós-verdade - discutindo as condições e os mecanismos de disseminação de fake news e também exemplos, causas e consequências desse fenômeno e da prevalência de crenças e opiniões sobre fatos -, de forma a adotar atitude crítica em relação ao fenômeno e desenvolver uma postura flexível que permita rever crenças e opiniões quando fatos apurados as contradisserem.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 42","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 523","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP41', 'Analisar os processos humanos e automáticos de curadoria que operam nas redes sociais e outros domínios da internet, comparando os feeds de diferentes páginas de redes sociais e discutindo os efeitos desses modelos de curadoria, de forma a ampliar as possibilidades de trato com o diferente e minimizar o efeito bolha e a manipulação de terceiros.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 43","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 523","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP42', 'Acompanhar, analisar e discutir a cobertura da mídia diante de acontecimentos e questões de relevância social, local e global, comparando diferentes enfoques e perspectivas, por meio do uso de ferramentas de curadoria (como agregadores de conteúdo) e da consulta a serviços e fontes de checagem e curadoria de informação, de forma a aprofundar o entendimento sobre um determinado fato ou questão, identificar o enfoque preponderante da mídia e manter-se implicado, de forma crítica, com os fatos e as questões que afetam a coletividade.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 44","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 524","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP43', 'Atuar de forma fundamentada, ética e crítica na produção e no compartilhamento de comentários, textos noticiosos e de opinião, memes, gifs, remixes variados etc. em redes sociais ou outros ambientes digitais.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 45","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 524","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP44', 'Analisar formas contemporâneas de publicidade em contexto digital (advergame, anúncios em vídeos, social advertising, unboxing, narrativa mercadológica, entre outras), e peças de campanhas publicitárias e políticas (cartazes, folhetos, anúncios, propagandas em diferentes mídias, spots, jingles etc.), identificando valores e representações de situações, grupos e configurações sociais veiculadas, desconstruindo estereótipos, destacando estratégias de engajamento e viralização e explicando os mecanismos de persuasão utilizados e os efeitos de sentido provocados pelas escolhas feitas em termos de elementos e recursos linguístico-discursivos, imagéticos, sonoros, gestuais e espaciais, entre outros.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 46","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 524","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP45', 'Analisar, discutir, produzir e socializar, tendo em vista temas e acontecimentos de interesse local ou global, notícias, fotodenúncias, fotorreportagens, reportagens multimidiáticas, documentários, infográficos, podcasts noticiosos, artigos de opinião, críticas da mídia, vlogs de opinião, textos de apresentação e apreciação de produções culturais (resenhas, ensaios etc.) e outros gêneros próprios das formas de expressão das culturas juvenis (vlogs e podcasts culturais, gameplay etc.), em várias mídias, vivenciando de forma significativa o papel de repórter, analista, crítico, editorialista ou articulista, leitor, vlogueiro e booktuber, entre outros.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 47","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 524","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP46', 'Compartilhar sentidos construídos na leitura/escuta de textos literários, percebendo diferenças e eventuais tensões entre as formas pessoais e as coletivas de apreensão desses textos, para exercitar o diálogo cultural e aguçar a perspectiva crítica.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 48","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 527","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP47', 'Participar de eventos (saraus, competições orais, audições, mostras, festivais, feiras culturais e literárias, rodas e clubes de leitura, cooperativas culturais, jograis, repentes, slams etc.), inclusive para socializar obras da própria autoria (poemas, contos e suas variedades, roteiros e microrroteiros, videominutos, playlists comentadas de música etc.) e/ou interpretar obras de outros, inserindo-se nas diferentes práticas culturais de seu tempo.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 49","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 527","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP48', 'Identificar assimilações, rupturas e permanências no processo de constituição da literatura brasileira e ao longo de sua trajetória, por meio da leitura e análise de obras fundamentais do cânone ocidental, em especial da literatura portuguesa, para perceber a historicidade de matrizes e procedimentos estéticos.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 50","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 527","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP49', 'Perceber as peculiaridades estruturais e estilísticas de diferentes gêneros literários (a apreensão pessoal do cotidiano nas crônicas, a manifestação livre e subjetiva do eu lírico diante do mundo nos poemas, a múltipla perspectiva da vida humana e social dos romances, a dimensão política e social de textos da literatura marginal e da periferia etc.) para experimentar os diferentes ângulos de apreensão do indivíduo e do mundo pela literatura.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 51","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 527","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP50', 'Analisar relações intertextuais e interdiscursivas entre obras de diferentes autores e gêneros literários de um mesmo momento histórico e de momentos históricos diversos, explorando os modos como a literatura e as artes em geral se constituem, dialogam e se retroalimentam.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 52","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 527","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP51', 'Selecionar obras do repertório artístico-literário contemporâneo à disposição segundo suas predileções, de modo a constituir um acervo pessoal e dele se apropriar para se inserir e intervir com autonomia e criticidade no meio cultural.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 53","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 527","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP52', 'Analisar obras significativas das literaturas brasileiras e de outros países e povos, em especial a portuguesa, a indígena, a africana e a latino-americana, com base em ferramentas da crítica literária (estrutura da composição, estilo, aspectos discursivos) ou outros critérios relacionados a diferentes matrizes culturais, considerando o contexto de produção (visões de mundo, diálogos com outros textos, inserções em movimentos estéticos e culturais etc.) e o modo como dialogam com o presente.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 54","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 528","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP53', 'Produzir apresentações e comentários apreciativos e críticos sobre livros, filmes, discos, canções, espetáculos de teatro e dança, exposições etc. (resenhas, vlogs e podcasts literários e artísticos, playlists comentadas, fanzines, e-zines etc.).', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 55","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 528","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb),
  ('EM13LP54', 'Criar obras autorais, em diferentes gêneros e mídias - mediante seleção e apropriação de recursos textuais e expressivos do repertório artístico -, e/ou produções derivadas (paródias, estilizações, fanfics, fanclipes etc.), como forma de dialogar crítica e/ou subjetivamente com o texto literário.', '{"documento":"bncc-2018","arquivo":"BNCC_Ensino_Medio.xlsx","proveniencia":"exportada de downloadbncc.mec.gov.br em 23/06/2023","localizador":"aba ''Hab. de Língua Portuguesa'', linha 56","localizador_pdf":"Base-Nacional-Comum-Curricular-BNCC.pdf, página PDF 528","fonte_catalogo":"https://downloadbncc.mec.gov.br/"}'::jsonb)
)
INSERT INTO curriculum_skills
  (curriculum_version, code, stage, subject, grade_range, description,
   dataset_version, validity_status, source_metadata)
SELECT 'BNCC-2018', code, 'Ensino Médio', 'Linguagens e suas Tecnologias',
       'Ensino Médio (sem seriação)', description, 'dados-2026.07',
       'vigente', source_metadata
FROM official_skills
ON CONFLICT (curriculum_version, code) DO UPDATE
SET stage = EXCLUDED.stage,
    subject = EXCLUDED.subject,
    grade_range = EXCLUDED.grade_range,
    description = EXCLUDED.description,
    knowledge_object_id = NULL,
    dataset_version = EXCLUDED.dataset_version,
    validity_status = EXCLUDED.validity_status,
    source_metadata = EXCLUDED.source_metadata;

DELETE FROM skill_competencies link
USING curriculum_skills skill
WHERE link.skill_id = skill.id
  AND skill.curriculum_version = 'BNCC-2018'
  AND skill.code ~ '^EM13LP[0-9]{2}$';

WITH official_links(code, competency_number) AS (
VALUES
  ('EM13LP01', 2),
  ('EM13LP02', 1),
  ('EM13LP03', 1),
  ('EM13LP04', 1),
  ('EM13LP05', 3),
  ('EM13LP06', 1),
  ('EM13LP07', 1),
  ('EM13LP08', 1),
  ('EM13LP09', 4),
  ('EM13LP10', 4),
  ('EM13LP11', 7),
  ('EM13LP12', 1),
  ('EM13LP12', 7),
  ('EM13LP13', 1),
  ('EM13LP14', 1),
  ('EM13LP15', 1),
  ('EM13LP15', 3),
  ('EM13LP16', 1),
  ('EM13LP16', 4),
  ('EM13LP17', 3),
  ('EM13LP17', 7),
  ('EM13LP18', 7),
  ('EM13LP19', 3),
  ('EM13LP20', 2),
  ('EM13LP20', 3),
  ('EM13LP21', 1),
  ('EM13LP21', 6),
  ('EM13LP22', 3),
  ('EM13LP23', 1),
  ('EM13LP23', 7),
  ('EM13LP24', 1),
  ('EM13LP25', 1),
  ('EM13LP25', 2),
  ('EM13LP25', 3),
  ('EM13LP26', 1),
  ('EM13LP27', 3),
  ('EM13LP28', 3),
  ('EM13LP28', 7),
  ('EM13LP29', 2),
  ('EM13LP29', 3),
  ('EM13LP30', 7),
  ('EM13LP31', 1),
  ('EM13LP32', 7),
  ('EM13LP33', 3),
  ('EM13LP34', 3),
  ('EM13LP35', 7),
  ('EM13LP36', 2),
  ('EM13LP37', 2),
  ('EM13LP38', 1),
  ('EM13LP38', 2),
  ('EM13LP39', 7),
  ('EM13LP40', 2),
  ('EM13LP40', 7),
  ('EM13LP41', 7),
  ('EM13LP42', 2),
  ('EM13LP43', 7),
  ('EM13LP44', 1),
  ('EM13LP44', 7),
  ('EM13LP45', 1),
  ('EM13LP45', 3),
  ('EM13LP46', 6),
  ('EM13LP47', 3),
  ('EM13LP47', 6),
  ('EM13LP48', 1),
  ('EM13LP48', 6),
  ('EM13LP49', 1),
  ('EM13LP49', 6),
  ('EM13LP50', 6),
  ('EM13LP51', 3),
  ('EM13LP52', 1),
  ('EM13LP52', 2),
  ('EM13LP53', 1),
  ('EM13LP53', 3),
  ('EM13LP54', 1),
  ('EM13LP54', 3)
)
INSERT INTO skill_competencies (skill_id, competency_id)
SELECT skill.id, competency.id
FROM curriculum_skills skill
JOIN official_links official ON official.code = skill.code
JOIN curriculum_areas area
  ON area.curriculum_version = skill.curriculum_version
 AND area.source_key = 'em-area-lgg'
JOIN curriculum_competencies competency
  ON competency.area_id = area.id
 AND competency.number = official.competency_number
WHERE skill.curriculum_version = 'BNCC-2018'
  AND skill.code ~ '^EM13LP[0-9]{2}$'
ON CONFLICT (skill_id, competency_id) DO NOTHING;

DELETE FROM pedagogical_discipline_skills link
USING pedagogical_disciplines discipline,
      curriculum_skills skill,
      curriculum_areas area
WHERE link.discipline_id = discipline.id
  AND link.skill_id = skill.id
  AND discipline.area_id = area.id
  AND area.source_key = 'em-area-lgg'
  AND discipline.stage = 'Ensino Médio'
  AND discipline.name <> 'Língua Portuguesa'
  AND skill.curriculum_version = 'BNCC-2018'
  AND skill.code ~ '^EM13LP[0-9]{2}$';

INSERT INTO pedagogical_discipline_skills
  (discipline_id, skill_id, tagged_by, rationale)
SELECT discipline.id, skill.id, discipline.created_by,
       'Habilidade BNCC específica do componente de Língua Portuguesa.'
FROM pedagogical_disciplines discipline
JOIN curriculum_areas area ON area.id = discipline.area_id
JOIN curriculum_skills skill
  ON skill.curriculum_version = 'BNCC-2018'
 AND skill.code ~ '^EM13LP[0-9]{2}$'
WHERE discipline.name = 'Língua Portuguesa'
  AND discipline.stage = 'Ensino Médio'
  AND area.source_key = 'em-area-lgg'
ON CONFLICT (discipline_id, skill_id) DO NOTHING;

DO $$
DECLARE total_skills integer; portuguese_skills integer; portuguese_competency_links integer;
BEGIN
  SELECT count(*) INTO total_skills FROM curriculum_skills
  WHERE curriculum_version = 'BNCC-2018' AND stage = 'Ensino Médio'
    AND (code ~ '^EM13(LGG|MAT|CNT|CHS)[0-9]{3}$'
      OR code ~ '^EM13LP[0-9]{2}$');
  IF total_skills <> 183 THEN
    RAISE EXCEPTION 'Catálogo BNCC do Ensino Médio incompleto: esperadas 183 habilidades, encontradas %.', total_skills;
  END IF;
  SELECT count(*) INTO portuguese_skills FROM curriculum_skills
  WHERE curriculum_version = 'BNCC-2018' AND stage = 'Ensino Médio'
    AND code ~ '^EM13LP[0-9]{2}$';
  IF portuguese_skills <> 54 THEN
    RAISE EXCEPTION 'Catálogo de Língua Portuguesa incompleto: esperadas 54 habilidades, encontradas %.', portuguese_skills;
  END IF;
  SELECT count(*) INTO portuguese_competency_links FROM curriculum_skills skill
  JOIN skill_competencies link ON link.skill_id = skill.id
  WHERE skill.curriculum_version = 'BNCC-2018' AND skill.stage = 'Ensino Médio'
    AND skill.code ~ '^EM13LP[0-9]{2}$';
  IF portuguese_competency_links <> 75 THEN
    RAISE EXCEPTION 'Vínculos de competências de Língua Portuguesa incorretos: esperados 75, encontrados %.', portuguese_competency_links;
  END IF;
END $$;
