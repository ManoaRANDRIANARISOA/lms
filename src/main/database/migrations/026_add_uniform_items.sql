-- Ajout de la colonne pour le stockage dynamique des uniformes achetés
ALTER TABLE student_fees ADD COLUMN uniform_items_purchased TEXT DEFAULT '[]';

-- Migration des anciennes données (colonnes booléennes) vers la nouvelle colonne JSON
-- On utilise une approche concaténée simple supportée par toutes les versions de SQLite.

UPDATE student_fees 
SET uniform_items_purchased = 
  '[' ||
  CASE WHEN uniform_tshirt_purchased = 1 THEN '"T-shirt"' ELSE '' END ||
  CASE WHEN uniform_tshirt_purchased = 1 AND (uniform_apron_purchased = 1 OR uniform_shorts_purchased = 1 OR uniform_badge_purchased = 1) THEN ',' ELSE '' END ||
  
  CASE WHEN uniform_apron_purchased = 1 THEN '"Tablier"' ELSE '' END ||
  CASE WHEN uniform_apron_purchased = 1 AND (uniform_shorts_purchased = 1 OR uniform_badge_purchased = 1) THEN ',' ELSE '' END ||
  
  CASE WHEN uniform_shorts_purchased = 1 THEN '"Survêtement"' ELSE '' END ||
  CASE WHEN uniform_shorts_purchased = 1 AND uniform_badge_purchased = 1 THEN ',' ELSE '' END ||
  
  CASE WHEN uniform_badge_purchased = 1 THEN '"Badge"' ELSE '' END ||
  ']'
WHERE uniform_tshirt_purchased = 1 
   OR uniform_apron_purchased = 1 
   OR uniform_shorts_purchased = 1 
   OR uniform_badge_purchased = 1;

-- Nettoyage des virgules en trop (au cas où, bien que la logique au-dessus devrait être propre)
UPDATE student_fees SET uniform_items_purchased = REPLACE(uniform_items_purchased, '[,', '[');
UPDATE student_fees SET uniform_items_purchased = REPLACE(uniform_items_purchased, ',]', ']');
UPDATE student_fees SET uniform_items_purchased = REPLACE(uniform_items_purchased, ',,', ',');
