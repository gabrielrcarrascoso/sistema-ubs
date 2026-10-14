-- Dicionário inicial de indicadores (APS Data & Performance).
-- São SUGESTÕES de partida: a Secretaria deve validar definições, fórmulas e metas
-- antes de usar os resultados oficialmente. Nenhum valor fictício é carregado.

insert into public.indicadores
  (codigo, nome, definicao, tipo, unidade_medida, numerador_desc, denominador_desc, fator, fonte_dados, periodicidade, meta, sentido_meta)
values
  ('PROD-01', 'Atendimentos no mês',
   'Total de atendimentos individuais registrados pela unidade no mês de competência.',
   'contagem', 'atendimentos', 'Atendimentos individuais registrados no mês', null, 1,
   'e-SUS APS / PEC — relatório de produção', 'Mensal', null, 'maior'),

  ('QUAL-01', 'Registros completos',
   'Percentual de registros de atendimento com todos os campos obrigatórios preenchidos.',
   'percentual', '%', 'Registros com campos obrigatórios completos', 'Total de registros de atendimento no mês', 100,
   'e-SUS APS / PEC — conferência de qualidade', 'Mensal', 90, 'maior'),

  ('PRE-01', 'Gestantes com 6 ou mais consultas de pré-natal',
   'Proporção de gestantes com pelo menos 6 consultas de pré-natal, sendo a 1ª até a 12ª semana de gestação.',
   'percentual', '%', 'Gestantes com ≥ 6 consultas (1ª até 12ª semana)', 'Gestantes identificadas no período', 100,
   'e-SUS APS / PEC', 'Mensal', 45, 'maior'),

  ('VAC-01', 'Cobertura vacinal (pólio e pentavalente)',
   'Proporção de crianças de 1 ano vacinadas na APS contra poliomielite e pentavalente.',
   'percentual', '%', 'Crianças de 1 ano com esquema completo', 'Crianças de 1 ano cadastradas', 100,
   'e-SUS APS / SI-PNI', 'Mensal', 95, 'maior'),

  ('HAS-01', 'Hipertensos com pressão aferida',
   'Proporção de pessoas com hipertensão com consulta e pressão arterial aferida no semestre.',
   'percentual', '%', 'Hipertensos com PA aferida no semestre', 'Hipertensos cadastrados', 100,
   'e-SUS APS / PEC', 'Mensal', 50, 'maior'),

  ('DM-01', 'Diabéticos com hemoglobina glicada solicitada',
   'Proporção de pessoas com diabetes com consulta e hemoglobina glicada solicitada no semestre.',
   'percentual', '%', 'Diabéticos com HbA1c solicitada no semestre', 'Diabéticos cadastrados', 100,
   'e-SUS APS / PEC', 'Mensal', 50, 'maior');
