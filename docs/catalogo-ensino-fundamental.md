# Catálogo BNCC do Ensino Fundamental

A migração 074 importa 1.304 habilidades e 780 objetos oficiais, com os nove componentes: Língua Portuguesa (391), Matemática (247), História (151), Geografia (123), Ciências (111), Língua Inglesa (88), Educação Física (69), Ensino Religioso (63) e Arte (61).

Fonte: [bncc-dev/bncc-dados](https://github.com/bncc-dev/bncc-dados/tree/daabd7dd63ae0cac0aa520b6189e79f95c24f583/dados/bncc-2018), commit fixado `daabd7dd63ae0cac0aa520b6189e79f95c24f583`, licença CC BY 4.0. Textos, anos, vigência e localizadores MEC são preservados. Não inclui o complemento de Computação.

A tela de questões do Fundamental usa componente → ano → objeto → habilidade. Os códigos que abrangem vários anos aparecem em cada ano previsto pela fonte. Competências específicas do componente e da área são exibidas como referência: a fonte não define uma relação individual habilidade → competência no Fundamental. Não se criam vínculos automáticos em `skill_competencies`.

A migração mantém os IDs de habilidades e as relações com questões existentes. Atualiza o texto e a classificação oficial dos códigos importados e acrescenta os objetos e vínculos faltantes, preservando vínculos anteriores. Também associa as habilidades às disciplinas pedagógicas do Fundamental em todas as instituições existentes.

A API fornece `skill_years` e `subject_metadata`; a informação de competências é enviada apenas uma vez por componente para evitar repetição no catálogo.

Testes: `node --test services/api/fundamental-curriculum.test.mjs services/api/bncc-import.test.mjs`. Homologar a migração em transação, repetir para validar idempotência, conferir os códigos ligados a questões anteriores e testar seleção por ano (por exemplo, Arte EF15/EF69 e Inglês 6º–9º anos).
