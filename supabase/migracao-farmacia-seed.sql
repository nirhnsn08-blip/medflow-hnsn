-- ============================================================
-- Valentrax — Farmácia · classe terapêutica + catálogo inicial
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), DEPOIS da Fase A.
-- Idempotente: só insere o que ainda não existe (por nome).
-- NÃO cria estoque — apenas o catálogo. As quantidades entram
-- depois pela tela (Entrada), com lote e validade.
-- ============================================================

-- Coluna de classe terapêutica (para agrupar/filtrar)
alter table public.farm_medicamentos add column if not exists classe text;

insert into public.farm_medicamentos (nome, principio_ativo, classe, forma, concentracao, unidade, controlado)
select v.nome, v.principio_ativo, v.classe, v.forma, v.concentracao, v.unidade, v.controlado
from (values
  -- ===== Analgésicos e antipiréticos =====
  ('Dipirona 500 mg comprimido','Dipirona sódica','Analgésicos e antipiréticos','Comprimido','500 mg','comprimido',false),
  ('Dipirona 500 mg/mL solução injetável','Dipirona sódica','Analgésicos e antipiréticos','Ampola','500 mg/mL','ampola',false),
  ('Dipirona 500 mg/mL gotas','Dipirona sódica','Analgésicos e antipiréticos','Frasco','500 mg/mL','frasco',false),
  ('Paracetamol 500 mg comprimido','Paracetamol','Analgésicos e antipiréticos','Comprimido','500 mg','comprimido',false),
  ('Paracetamol 200 mg/mL gotas','Paracetamol','Analgésicos e antipiréticos','Frasco','200 mg/mL','frasco',false),
  ('Ácido acetilsalicílico 100 mg comprimido','Ácido acetilsalicílico','Analgésicos e antipiréticos','Comprimido','100 mg','comprimido',false),
  -- ===== Anti-inflamatórios (AINEs) =====
  ('Ibuprofeno 600 mg comprimido','Ibuprofeno','Anti-inflamatórios (AINEs)','Comprimido','600 mg','comprimido',false),
  ('Diclofenaco sódico 50 mg comprimido','Diclofenaco sódico','Anti-inflamatórios (AINEs)','Comprimido','50 mg','comprimido',false),
  ('Diclofenaco sódico 25 mg/mL injetável','Diclofenaco sódico','Anti-inflamatórios (AINEs)','Ampola','25 mg/mL','ampola',false),
  ('Cetoprofeno 100 mg injetável','Cetoprofeno','Anti-inflamatórios (AINEs)','Frasco-ampola','100 mg','frasco-ampola',false),
  ('Naproxeno 500 mg comprimido','Naproxeno','Anti-inflamatórios (AINEs)','Comprimido','500 mg','comprimido',false),
  ('Tenoxicam 20 mg injetável','Tenoxicam','Anti-inflamatórios (AINEs)','Frasco-ampola','20 mg','frasco-ampola',false),
  -- ===== Opioides =====
  ('Morfina 10 mg/mL injetável','Sulfato de morfina','Opioides','Ampola','10 mg/mL','ampola',true),
  ('Morfina 10 mg comprimido','Sulfato de morfina','Opioides','Comprimido','10 mg','comprimido',true),
  ('Fentanila 50 mcg/mL injetável','Citrato de fentanila','Opioides','Ampola','50 mcg/mL','ampola',true),
  ('Tramadol 50 mg/mL injetável','Cloridrato de tramadol','Opioides','Ampola','50 mg/mL','ampola',true),
  ('Tramadol 50 mg cápsula','Cloridrato de tramadol','Opioides','Cápsula','50 mg','cápsula',true),
  ('Codeína 30 mg comprimido','Fosfato de codeína','Opioides','Comprimido','30 mg','comprimido',true),
  ('Metadona 10 mg comprimido','Cloridrato de metadona','Opioides','Comprimido','10 mg','comprimido',true),
  -- ===== Anestésicos =====
  ('Lidocaína 2% sem vasoconstritor','Cloridrato de lidocaína','Anestésicos','Frasco','20 mg/mL','frasco',false),
  ('Lidocaína 2% geleia','Cloridrato de lidocaína','Anestésicos','Bisnaga/Pomada','20 mg/g','unidade',false),
  ('Bupivacaína 0,5% injetável','Cloridrato de bupivacaína','Anestésicos','Frasco-ampola','5 mg/mL','frasco-ampola',false),
  ('Propofol 10 mg/mL injetável','Propofol','Anestésicos','Ampola','10 mg/mL','ampola',false),
  ('Cetamina 50 mg/mL injetável','Cloridrato de cetamina','Anestésicos','Frasco-ampola','50 mg/mL','frasco-ampola',true),
  ('Etomidato 2 mg/mL injetável','Etomidato','Anestésicos','Ampola','2 mg/mL','ampola',false),
  -- ===== Antibióticos =====
  ('Amoxicilina 500 mg cápsula','Amoxicilina','Antibióticos','Cápsula','500 mg','cápsula',false),
  ('Amoxicilina + Clavulanato 500+125 mg comprimido','Amoxicilina + clavulanato de potássio','Antibióticos','Comprimido','500+125 mg','comprimido',false),
  ('Ampicilina 1 g injetável','Ampicilina sódica','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Cefalexina 500 mg cápsula','Cefalexina','Antibióticos','Cápsula','500 mg','cápsula',false),
  ('Cefazolina 1 g injetável','Cefazolina sódica','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Ceftriaxona 1 g injetável','Ceftriaxona sódica','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Cefepima 1 g injetável','Cefepima','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Ciprofloxacino 500 mg comprimido','Ciprofloxacino','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Ciprofloxacino 2 mg/mL bolsa','Ciprofloxacino','Antibióticos','Bolsa/Soro','2 mg/mL','bolsa',false),
  ('Levofloxacino 500 mg comprimido','Levofloxacino','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Azitromicina 500 mg comprimido','Azitromicina','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Claritromicina 500 mg comprimido','Claritromicina','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Clindamicina 150 mg/mL injetável','Fosfato de clindamicina','Antibióticos','Ampola','150 mg/mL','ampola',false),
  ('Metronidazol 500 mg comprimido','Metronidazol','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Metronidazol 5 mg/mL bolsa','Metronidazol','Antibióticos','Bolsa/Soro','5 mg/mL','bolsa',false),
  ('Gentamicina 40 mg/mL injetável','Sulfato de gentamicina','Antibióticos','Ampola','40 mg/mL','ampola',false),
  ('Amicacina 250 mg/mL injetável','Sulfato de amicacina','Antibióticos','Frasco-ampola','250 mg/mL','frasco-ampola',false),
  ('Vancomicina 500 mg injetável','Cloridrato de vancomicina','Antibióticos','Frasco-ampola','500 mg','frasco-ampola',false),
  ('Piperacilina + Tazobactam 4,5 g injetável','Piperacilina + tazobactam','Antibióticos','Frasco-ampola','4,5 g','frasco-ampola',false),
  ('Meropenem 1 g injetável','Meropenem','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Imipenem + Cilastatina 500 mg injetável','Imipenem + cilastatina','Antibióticos','Frasco-ampola','500 mg','frasco-ampola',false),
  ('Oxacilina 500 mg injetável','Oxacilina sódica','Antibióticos','Frasco-ampola','500 mg','frasco-ampola',false),
  ('Sulfametoxazol + Trimetoprima 400+80 mg comprimido','Sulfametoxazol + trimetoprima','Antibióticos','Comprimido','400+80 mg','comprimido',false),
  ('Polimixina B 500.000 UI injetável','Polimixina B','Antibióticos','Frasco-ampola','500.000 UI','frasco-ampola',false),
  -- ===== Antifúngicos =====
  ('Fluconazol 150 mg cápsula','Fluconazol','Antifúngicos','Cápsula','150 mg','cápsula',false),
  ('Fluconazol 2 mg/mL bolsa','Fluconazol','Antifúngicos','Bolsa/Soro','2 mg/mL','bolsa',false),
  ('Nistatina 100.000 UI/mL suspensão oral','Nistatina','Antifúngicos','Solução oral','100.000 UI/mL','frasco',false),
  ('Anfotericina B 50 mg injetável','Anfotericina B','Antifúngicos','Frasco-ampola','50 mg','frasco-ampola',false),
  ('Cetoconazol 200 mg comprimido','Cetoconazol','Antifúngicos','Comprimido','200 mg','comprimido',false),
  -- ===== Antivirais =====
  ('Aciclovir 200 mg comprimido','Aciclovir','Antivirais','Comprimido','200 mg','comprimido',false),
  ('Aciclovir 250 mg injetável','Aciclovir sódico','Antivirais','Frasco-ampola','250 mg','frasco-ampola',false),
  ('Oseltamivir 75 mg cápsula','Fosfato de oseltamivir','Antivirais','Cápsula','75 mg','cápsula',false),
  -- ===== Insulinas =====
  ('Insulina Regular 100 UI/mL','Insulina humana regular','Insulinas','Frasco','100 UI/mL','frasco',false),
  ('Insulina NPH 100 UI/mL','Insulina humana NPH','Insulinas','Frasco','100 UI/mL','frasco',false),
  ('Insulina Glargina 100 UI/mL','Insulina glargina','Insulinas','Frasco','100 UI/mL','frasco',false),
  ('Insulina Lispro 100 UI/mL','Insulina lispro','Insulinas','Frasco','100 UI/mL','frasco',false),
  ('Insulina Asparte 100 UI/mL','Insulina asparte','Insulinas','Frasco','100 UI/mL','frasco',false),
  -- ===== Antidiabéticos orais =====
  ('Metformina 500 mg comprimido','Cloridrato de metformina','Antidiabéticos orais','Comprimido','500 mg','comprimido',false),
  ('Metformina 850 mg comprimido','Cloridrato de metformina','Antidiabéticos orais','Comprimido','850 mg','comprimido',false),
  ('Glibenclamida 5 mg comprimido','Glibenclamida','Antidiabéticos orais','Comprimido','5 mg','comprimido',false),
  ('Gliclazida 30 mg comprimido','Gliclazida','Antidiabéticos orais','Comprimido','30 mg','comprimido',false),
  -- ===== Cardiovasculares e anti-hipertensivos =====
  ('Losartana potássica 50 mg comprimido','Losartana potássica','Cardiovasculares e anti-hipertensivos','Comprimido','50 mg','comprimido',false),
  ('Enalapril 10 mg comprimido','Maleato de enalapril','Cardiovasculares e anti-hipertensivos','Comprimido','10 mg','comprimido',false),
  ('Captopril 25 mg comprimido','Captopril','Cardiovasculares e anti-hipertensivos','Comprimido','25 mg','comprimido',false),
  ('Anlodipino 5 mg comprimido','Besilato de anlodipino','Cardiovasculares e anti-hipertensivos','Comprimido','5 mg','comprimido',false),
  ('Atenolol 50 mg comprimido','Atenolol','Cardiovasculares e anti-hipertensivos','Comprimido','50 mg','comprimido',false),
  ('Metoprolol 25 mg comprimido','Succinato de metoprolol','Cardiovasculares e anti-hipertensivos','Comprimido','25 mg','comprimido',false),
  ('Propranolol 40 mg comprimido','Cloridrato de propranolol','Cardiovasculares e anti-hipertensivos','Comprimido','40 mg','comprimido',false),
  ('Carvedilol 6,25 mg comprimido','Carvedilol','Cardiovasculares e anti-hipertensivos','Comprimido','6,25 mg','comprimido',false),
  ('Hidralazina 20 mg/mL injetável','Cloridrato de hidralazina','Cardiovasculares e anti-hipertensivos','Ampola','20 mg/mL','ampola',false),
  ('Amiodarona 200 mg comprimido','Cloridrato de amiodarona','Cardiovasculares e anti-hipertensivos','Comprimido','200 mg','comprimido',false),
  ('Amiodarona 50 mg/mL injetável','Cloridrato de amiodarona','Cardiovasculares e anti-hipertensivos','Ampola','50 mg/mL','ampola',false),
  ('Digoxina 0,25 mg comprimido','Digoxina','Cardiovasculares e anti-hipertensivos','Comprimido','0,25 mg','comprimido',false),
  ('Isossorbida 5 mg sublingual','Dinitrato de isossorbida','Cardiovasculares e anti-hipertensivos','Comprimido','5 mg','comprimido',false),
  ('Nifedipino 20 mg comprimido','Nifedipino','Cardiovasculares e anti-hipertensivos','Comprimido','20 mg','comprimido',false),
  -- ===== Diuréticos =====
  ('Furosemida 40 mg comprimido','Furosemida','Diuréticos','Comprimido','40 mg','comprimido',false),
  ('Furosemida 10 mg/mL injetável','Furosemida','Diuréticos','Ampola','10 mg/mL','ampola',false),
  ('Hidroclorotiazida 25 mg comprimido','Hidroclorotiazida','Diuréticos','Comprimido','25 mg','comprimido',false),
  ('Espironolactona 25 mg comprimido','Espironolactona','Diuréticos','Comprimido','25 mg','comprimido',false),
  ('Manitol 20% frasco','Manitol','Diuréticos','Frasco','200 mg/mL','frasco',false),
  -- ===== Anticoagulantes e antitrombóticos =====
  ('Heparina sódica 5.000 UI/mL injetável','Heparina sódica','Anticoagulantes e antitrombóticos','Frasco-ampola','5.000 UI/mL','frasco-ampola',false),
  ('Enoxaparina 40 mg seringa','Enoxaparina sódica','Anticoagulantes e antitrombóticos','Seringa','40 mg','seringa',false),
  ('Enoxaparina 60 mg seringa','Enoxaparina sódica','Anticoagulantes e antitrombóticos','Seringa','60 mg','seringa',false),
  ('Varfarina 5 mg comprimido','Varfarina sódica','Anticoagulantes e antitrombóticos','Comprimido','5 mg','comprimido',false),
  ('Rivaroxabana 20 mg comprimido','Rivaroxabana','Anticoagulantes e antitrombóticos','Comprimido','20 mg','comprimido',false),
  ('Clopidogrel 75 mg comprimido','Clopidogrel','Anticoagulantes e antitrombóticos','Comprimido','75 mg','comprimido',false),
  ('Alteplase 50 mg injetável','Alteplase','Anticoagulantes e antitrombóticos','Frasco-ampola','50 mg','frasco-ampola',false),
  -- ===== Drogas vasoativas =====
  ('Noradrenalina 2 mg/mL injetável','Hemitartarato de noradrenalina','Drogas vasoativas','Ampola','2 mg/mL','ampola',false),
  ('Adrenalina 1 mg/mL injetável','Epinefrina','Drogas vasoativas','Ampola','1 mg/mL','ampola',false),
  ('Dopamina 5 mg/mL injetável','Cloridrato de dopamina','Drogas vasoativas','Ampola','5 mg/mL','ampola',false),
  ('Dobutamina 12,5 mg/mL injetável','Cloridrato de dobutamina','Drogas vasoativas','Ampola','12,5 mg/mL','ampola',false),
  ('Vasopressina 20 UI/mL injetável','Vasopressina','Drogas vasoativas','Ampola','20 UI/mL','ampola',false),
  -- ===== Respiratório / broncodilatadores =====
  ('Salbutamol spray 100 mcg/dose','Sulfato de salbutamol','Respiratório / broncodilatadores','Spray/Aerossol','100 mcg/dose','frasco',false),
  ('Salbutamol 5 mg/mL solução p/ nebulização','Sulfato de salbutamol','Respiratório / broncodilatadores','Frasco','5 mg/mL','frasco',false),
  ('Ipratrópio 0,25 mg/mL solução','Brometo de ipratrópio','Respiratório / broncodilatadores','Frasco','0,25 mg/mL','frasco',false),
  ('Aminofilina 24 mg/mL injetável','Aminofilina','Respiratório / broncodilatadores','Ampola','24 mg/mL','ampola',false),
  ('Budesonida spray 200 mcg/dose','Budesonida','Respiratório / broncodilatadores','Spray/Aerossol','200 mcg/dose','frasco',false),
  -- ===== Corticoides =====
  ('Hidrocortisona 100 mg injetável','Succinato sódico de hidrocortisona','Corticoides','Frasco-ampola','100 mg','frasco-ampola',false),
  ('Hidrocortisona 500 mg injetável','Succinato sódico de hidrocortisona','Corticoides','Frasco-ampola','500 mg','frasco-ampola',false),
  ('Dexametasona 4 mg/mL injetável','Fosfato dissódico de dexametasona','Corticoides','Ampola','4 mg/mL','ampola',false),
  ('Dexametasona 4 mg comprimido','Dexametasona','Corticoides','Comprimido','4 mg','comprimido',false),
  ('Prednisona 20 mg comprimido','Prednisona','Corticoides','Comprimido','20 mg','comprimido',false),
  ('Prednisolona 3 mg/mL solução oral','Fosfato sódico de prednisolona','Corticoides','Solução oral','3 mg/mL','frasco',false),
  ('Metilprednisolona 500 mg injetável','Succinato sódico de metilprednisolona','Corticoides','Frasco-ampola','500 mg','frasco-ampola',false),
  -- ===== Antieméticos =====
  ('Metoclopramida 10 mg comprimido','Cloridrato de metoclopramida','Antieméticos','Comprimido','10 mg','comprimido',false),
  ('Metoclopramida 5 mg/mL injetável','Cloridrato de metoclopramida','Antieméticos','Ampola','5 mg/mL','ampola',false),
  ('Ondansetrona 2 mg/mL injetável','Cloridrato de ondansetrona','Antieméticos','Ampola','2 mg/mL','ampola',false),
  ('Ondansetrona 8 mg comprimido','Cloridrato de ondansetrona','Antieméticos','Comprimido','8 mg','comprimido',false),
  ('Bromoprida 10 mg comprimido','Bromoprida','Antieméticos','Comprimido','10 mg','comprimido',false),
  -- ===== Antiulcerosos / protetores gástricos =====
  ('Omeprazol 20 mg cápsula','Omeprazol','Antiulcerosos / protetores gástricos','Cápsula','20 mg','cápsula',false),
  ('Omeprazol 40 mg injetável','Omeprazol sódico','Antiulcerosos / protetores gástricos','Frasco-ampola','40 mg','frasco-ampola',false),
  ('Pantoprazol 40 mg comprimido','Pantoprazol sódico','Antiulcerosos / protetores gástricos','Comprimido','40 mg','comprimido',false),
  ('Pantoprazol 40 mg injetável','Pantoprazol sódico','Antiulcerosos / protetores gástricos','Frasco-ampola','40 mg','frasco-ampola',false),
  ('Famotidina 20 mg comprimido','Famotidina','Antiulcerosos / protetores gástricos','Comprimido','20 mg','comprimido',false),
  -- ===== Sedativos e anticonvulsivantes =====
  ('Midazolam 5 mg/mL injetável','Midazolam','Sedativos e anticonvulsivantes','Ampola','5 mg/mL','ampola',true),
  ('Midazolam 15 mg comprimido','Midazolam','Sedativos e anticonvulsivantes','Comprimido','15 mg','comprimido',true),
  ('Diazepam 5 mg/mL injetável','Diazepam','Sedativos e anticonvulsivantes','Ampola','5 mg/mL','ampola',true),
  ('Diazepam 10 mg comprimido','Diazepam','Sedativos e anticonvulsivantes','Comprimido','10 mg','comprimido',true),
  ('Clonazepam 2 mg comprimido','Clonazepam','Sedativos e anticonvulsivantes','Comprimido','2 mg','comprimido',true),
  ('Fenobarbital 100 mg comprimido','Fenobarbital','Sedativos e anticonvulsivantes','Comprimido','100 mg','comprimido',true),
  ('Fenobarbital 100 mg/mL injetável','Fenobarbital sódico','Sedativos e anticonvulsivantes','Ampola','100 mg/mL','ampola',true),
  ('Fenitoína 100 mg comprimido','Fenitoína sódica','Sedativos e anticonvulsivantes','Comprimido','100 mg','comprimido',false),
  ('Fenitoína 50 mg/mL injetável','Fenitoína sódica','Sedativos e anticonvulsivantes','Ampola','50 mg/mL','ampola',false),
  ('Ácido valproico 500 mg comprimido','Valproato de sódio','Sedativos e anticonvulsivantes','Comprimido','500 mg','comprimido',false),
  ('Levetiracetam 500 mg comprimido','Levetiracetam','Sedativos e anticonvulsivantes','Comprimido','500 mg','comprimido',false),
  -- ===== Antipsicóticos e antidepressivos =====
  ('Haloperidol 5 mg/mL injetável','Haloperidol','Antipsicóticos e antidepressivos','Ampola','5 mg/mL','ampola',false),
  ('Haloperidol 5 mg comprimido','Haloperidol','Antipsicóticos e antidepressivos','Comprimido','5 mg','comprimido',false),
  ('Clorpromazina 25 mg/mL injetável','Cloridrato de clorpromazina','Antipsicóticos e antidepressivos','Ampola','25 mg/mL','ampola',false),
  ('Quetiapina 25 mg comprimido','Fumarato de quetiapina','Antipsicóticos e antidepressivos','Comprimido','25 mg','comprimido',false),
  ('Risperidona 2 mg comprimido','Risperidona','Antipsicóticos e antidepressivos','Comprimido','2 mg','comprimido',false),
  ('Amitriptilina 25 mg comprimido','Cloridrato de amitriptilina','Antipsicóticos e antidepressivos','Comprimido','25 mg','comprimido',false),
  ('Sertralina 50 mg comprimido','Cloridrato de sertralina','Antipsicóticos e antidepressivos','Comprimido','50 mg','comprimido',false),
  ('Fluoxetina 20 mg cápsula','Cloridrato de fluoxetina','Antipsicóticos e antidepressivos','Cápsula','20 mg','cápsula',false),
  -- ===== Anti-histamínicos / antialérgicos =====
  ('Prometazina 25 mg/mL injetável','Cloridrato de prometazina','Anti-histamínicos / antialérgicos','Ampola','25 mg/mL','ampola',false),
  ('Prometazina 25 mg comprimido','Cloridrato de prometazina','Anti-histamínicos / antialérgicos','Comprimido','25 mg','comprimido',false),
  ('Dexclorfeniramina 2 mg comprimido','Maleato de dexclorfeniramina','Anti-histamínicos / antialérgicos','Comprimido','2 mg','comprimido',false),
  ('Difenidramina 50 mg/mL injetável','Cloridrato de difenidramina','Anti-histamínicos / antialérgicos','Ampola','50 mg/mL','ampola',false),
  ('Loratadina 10 mg comprimido','Loratadina','Anti-histamínicos / antialérgicos','Comprimido','10 mg','comprimido',false),
  ('Hidroxizina 25 mg comprimido','Cloridrato de hidroxizina','Anti-histamínicos / antialérgicos','Comprimido','25 mg','comprimido',false),
  -- ===== Soluções, eletrólitos e soros =====
  ('Cloreto de sódio 0,9% 500 mL','Cloreto de sódio','Soluções, eletrólitos e soros','Bolsa/Soro','0,9%','bolsa',false),
  ('Cloreto de sódio 0,9% 250 mL','Cloreto de sódio','Soluções, eletrólitos e soros','Bolsa/Soro','0,9%','bolsa',false),
  ('Glicose 5% 500 mL','Glicose','Soluções, eletrólitos e soros','Bolsa/Soro','5%','bolsa',false),
  ('Glicose 50% 10 mL','Glicose','Soluções, eletrólitos e soros','Ampola','50%','ampola',false),
  ('Ringer com lactato 500 mL','Solução de Ringer com lactato','Soluções, eletrólitos e soros','Bolsa/Soro','500 mL','bolsa',false),
  ('Cloreto de potássio 19,1% 10 mL','Cloreto de potássio','Soluções, eletrólitos e soros','Ampola','191 mg/mL','ampola',false),
  ('Cloreto de sódio 20% 10 mL','Cloreto de sódio','Soluções, eletrólitos e soros','Ampola','200 mg/mL','ampola',false),
  ('Gluconato de cálcio 10% injetável','Gluconato de cálcio','Soluções, eletrólitos e soros','Ampola','100 mg/mL','ampola',false),
  ('Sulfato de magnésio 50% 10 mL','Sulfato de magnésio','Soluções, eletrólitos e soros','Ampola','500 mg/mL','ampola',false),
  ('Bicarbonato de sódio 8,4% 10 mL','Bicarbonato de sódio','Soluções, eletrólitos e soros','Ampola','84 mg/mL','ampola',false),
  ('Água para injeção 10 mL','Água para injeção','Soluções, eletrólitos e soros','Ampola','10 mL','ampola',false),
  -- ===== Vitaminas e suplementos =====
  ('Complexo B injetável','Vitaminas do complexo B','Vitaminas e suplementos','Ampola','2 mL','ampola',false),
  ('Tiamina (B1) 100 mg/mL injetável','Cloridrato de tiamina','Vitaminas e suplementos','Ampola','100 mg/mL','ampola',false),
  ('Vitamina C 100 mg/mL injetável','Ácido ascórbico','Vitaminas e suplementos','Ampola','100 mg/mL','ampola',false),
  ('Vitamina K 10 mg/mL injetável','Fitomenadiona','Vitaminas e suplementos','Ampola','10 mg/mL','ampola',false),
  ('Ácido fólico 5 mg comprimido','Ácido fólico','Vitaminas e suplementos','Comprimido','5 mg','comprimido',false),
  ('Sulfato ferroso 40 mg comprimido','Sulfato ferroso','Vitaminas e suplementos','Comprimido','40 mg Fe','comprimido',false),
  ('Cianocobalamina (B12) 1 mg/mL injetável','Cianocobalamina','Vitaminas e suplementos','Ampola','1 mg/mL','ampola',false)
) as v(nome, principio_ativo, classe, forma, concentracao, unidade, controlado)
where not exists (
  select 1 from public.farm_medicamentos m where lower(m.nome) = lower(v.nome)
);

-- Confira quantos ficaram cadastrados:
-- select classe, count(*) from public.farm_medicamentos group by classe order by classe;
