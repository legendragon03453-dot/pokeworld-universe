-- Additive production integration. No existing balance is rewritten.
-- Run only after the isolated verification; preserve the existing ledger trigger.
CREATE TABLE pwu_pix_orders (
 reference CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 account_id INT NOT NULL, package_id VARCHAR(32) NOT NULL,
 amount_cents INT UNSIGNED NOT NULL, credits INT UNSIGNED NOT NULL,
 provider_order_id VARCHAR(250) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
 payment_id VARCHAR(250) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
 operation_id CHAR(36) NULL UNIQUE, history_id INT NULL UNIQUE,
 event_id VARCHAR(250) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 fulfilled_at DATETIME NULL,
 UNIQUE KEY pwu_pix_request(account_id,request_id),
 CHECK(account_id>0 AND amount_cents BETWEEN 100 AND 2000000 AND credits BETWEEN 1 AND 26000)
) ENGINE=InnoDB;

CREATE TABLE pwu_pix_reviews (
 event_id VARCHAR(250) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 payment_id VARCHAR(250) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 event_type VARCHAR(80) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 resolved_at DATETIME NULL, resolution VARCHAR(255) NULL,
 KEY pwu_pix_review_intent(payment_id,resolved_at)
) ENGINE=InnoDB;

DELIMITER $$
CREATE PROCEDURE pwu_pix_create(IN p_account INT,IN p_request CHAR(36),IN p_package VARCHAR(32),IN p_amount INT,IN p_credits INT)
SQL SECURITY DEFINER
BEGIN
 DECLARE v_account INT DEFAULT NULL;
 DECLARE v_reference CHAR(36); DECLARE v_package VARCHAR(32); DECLARE v_amount INT; DECLARE v_credits INT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 IF p_account IS NULL OR p_account<1 OR p_request IS NULL OR p_request NOT REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR p_package IS NULL OR p_package NOT IN ('custom','plus','premium','master','ultra','legend','mythic')
 OR p_amount IS NULL OR p_amount NOT BETWEEN 100 AND 2000000 OR p_credits IS NULL OR p_credits NOT BETWEEN 1 AND 26000 THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pix-invalid-order'; END IF;
 START TRANSACTION;
 -- Serialize creation on this account, including retries with the same request ID.
 SELECT id INTO v_account FROM accounts WHERE id=p_account FOR UPDATE;
 IF v_account IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pix-account-missing'; END IF;
 IF EXISTS(SELECT 1 FROM pwu_pix_orders o JOIN pwu_pix_reviews r ON r.payment_id=o.payment_id WHERE o.account_id=p_account AND r.resolved_at IS NULL) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pix-account-review'; END IF;
 SELECT reference,package_id,amount_cents,credits INTO v_reference,v_package,v_amount,v_credits
 FROM pwu_pix_orders WHERE account_id=p_account AND request_id=p_request FOR UPDATE;
 IF v_reference IS NULL THEN
  SET v_reference=UUID();
  INSERT INTO pwu_pix_orders(reference,request_id,account_id,package_id,amount_cents,credits)
   VALUES(v_reference,p_request,p_account,p_package,p_amount,p_credits);
 ELSEIF NOT (BINARY v_package <=> BINARY p_package) OR v_amount<>p_amount OR v_credits<>p_credits THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pix-request-conflict';
 END IF;
 COMMIT;
 SELECT * FROM pwu_pix_orders WHERE reference=v_reference;
END$$

CREATE PROCEDURE pwu_pix_read(IN p_reference CHAR(36))
SQL SECURITY DEFINER
BEGIN
 SELECT * FROM pwu_pix_orders WHERE reference=p_reference;
END$$

CREATE PROCEDURE pwu_pix_bind(IN p_account INT,IN p_reference CHAR(36),IN p_order_id VARCHAR(250))
SQL SECURITY DEFINER
BEGIN
 DECLARE v_account INT DEFAULT NULL; DECLARE v_order_id VARCHAR(250);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 IF p_account IS NULL OR p_order_id IS NULL OR p_order_id NOT REGEXP '^ORD[A-Z0-9]{26}$' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pix-binding-invalid'; END IF;
 START TRANSACTION;
 SELECT account_id,provider_order_id INTO v_account,v_order_id FROM pwu_pix_orders WHERE reference=p_reference FOR UPDATE;
 IF v_account IS NULL OR v_account<>p_account OR (v_order_id IS NOT NULL AND BINARY v_order_id<>BINARY p_order_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pix-binding-mismatch'; END IF;
 UPDATE pwu_pix_orders SET provider_order_id=p_order_id WHERE reference=p_reference;
 COMMIT;
END$$

CREATE PROCEDURE pwu_pix_fulfill(IN p_reference CHAR(36),IN p_account INT,IN p_order_id VARCHAR(250),IN p_event VARCHAR(250),IN p_amount INT,IN p_currency VARCHAR(10),IN p_payment VARCHAR(250))
SQL SECURITY DEFINER
BEGIN
 DECLARE v_account INT DEFAULT NULL; DECLARE v_credits INT; DECLARE v_amount INT; DECLARE v_package VARCHAR(32);
 DECLARE v_order_id VARCHAR(250); DECLARE v_payment VARCHAR(250); DECLARE v_operation CHAR(36); DECLARE v_history INT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 IF p_account IS NULL OR p_order_id IS NULL OR p_order_id NOT REGEXP '^ORD[A-Z0-9]{26}$'
 OR p_event IS NULL OR p_event NOT REGEXP '^[A-Za-z0-9_-]{1,100}$'
 OR p_payment IS NULL OR p_payment NOT REGEXP '^PAY[A-Z0-9]{26}$'
 OR p_amount IS NULL OR p_currency IS NULL OR BINARY p_currency<>'BRL' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pix-invalid-payment'; END IF;
 START TRANSACTION;
 SELECT account_id,credits,amount_cents,package_id,provider_order_id,payment_id,operation_id
 INTO v_account,v_credits,v_amount,v_package,v_order_id,v_payment,v_operation
 FROM pwu_pix_orders WHERE reference=p_reference FOR UPDATE;
 IF v_account IS NULL OR v_account<>p_account OR v_amount<>p_amount
 OR (v_order_id IS NOT NULL AND BINARY v_order_id<>BINARY p_order_id)
 OR (v_payment IS NOT NULL AND BINARY v_payment<>BINARY p_payment) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pix-payment-mismatch'; END IF;
 IF v_operation IS NOT NULL THEN
  COMMIT; SELECT 0 AS credited;
 ELSE
  IF EXISTS(SELECT 1 FROM pwu_pix_reviews WHERE payment_id=p_payment AND resolved_at IS NULL) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pix-payment-review'; END IF;
  SET v_operation=UUID();
  -- Existing BEFORE INSERT trigger locks and adjusts the canonical wallet atomically.
  INSERT INTO pwu_diamond_operations(operation_id,source_account,target_account,amount,reason)
   VALUES(v_operation,NULL,v_account,v_credits,'pix_live');
  INSERT INTO historico_pagamentos(payment_id,tipo,account_id,player_id,currency,valor,id_pacote,multiplicador,promocional_id,status,entregue,date_created,pwu_package_id,pwu_amount_cents,pwu_reference,pwu_credit_unit)
   VALUES(p_order_id,'mercadopago',v_account,NULL,'BRL',v_credits,NULL,1,0,1,1,UTC_TIMESTAMP(),v_package,v_amount,p_reference,'account_diamond_points');
  SET v_history=LAST_INSERT_ID();
  UPDATE pwu_pix_orders SET provider_order_id=p_order_id,payment_id=p_payment,operation_id=v_operation,history_id=v_history,event_id=p_event,fulfilled_at=UTC_TIMESTAMP() WHERE reference=p_reference;
  COMMIT; SELECT 1 AS credited;
 END IF;
END$$

CREATE PROCEDURE pwu_pix_flag(IN p_event VARCHAR(250),IN p_payment VARCHAR(250),IN p_type VARCHAR(80))
SQL SECURITY DEFINER
BEGIN
 IF p_event IS NULL OR p_event NOT REGEXP '^[A-Za-z0-9_-]{1,100}$' OR p_payment IS NULL OR p_payment NOT REGEXP '^PAY[A-Z0-9]{26}$'
 OR p_type IS NULL OR p_type NOT IN ('payment_review') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pix-review-invalid'; END IF;
 INSERT INTO pwu_pix_reviews(event_id,payment_id,event_type) VALUES(p_event,p_payment,p_type)
 ON DUPLICATE KEY UPDATE event_id=VALUES(event_id);
 SELECT 1 AS recorded;
END$$
DELIMITER ;
