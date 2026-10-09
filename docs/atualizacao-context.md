# Atualização mensal do ConTeXt

O workflow `Atualizar ConTeXt mensalmente` solicita um novo build do serviço `ufaprova-renderer` no primeiro dia de cada mês. O Dockerfile baixa a versão atual do ConTeXt durante o build, executa `mtxrun --generate` ao iniciar o worker e usa o executável `context` diretamente para renderizar as provas.

## Configuração única

1. No Render, abra o serviço `ufaprova-renderer` e crie um **Deploy Hook**.
2. No GitHub, abra `Settings → Secrets and variables → Actions` e crie o segredo `RENDER_RENDERER_DEPLOY_HOOK_URL` com a URL do hook.
3. Execute o workflow manualmente uma vez para validar a configuração.

A URL do hook é um segredo: não deve ser commitada nem publicada em logs. O workflow também pode ser iniciado manualmente pela aba **Actions**.

## Verificação

Depois da execução, confirme no Render que o novo deploy do renderer terminou com sucesso e faça uma renderização de prova. Uma falha no build não substitui a versão anterior do serviço.
