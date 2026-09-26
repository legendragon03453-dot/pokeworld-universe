-- Additive production integration. No existing balance is rewritten.
-- Run only after the isolated verification; preserve the existing ledger trigger.
CREATE TABLE pwu_stripe_orders (
 reference CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 account_id INT NOT NULL, package_id VARCHAR(32) NOT NULL,
 amount_cents INT UNSIGNED NOT NULL, credits INT UNSIGNED NOT NULL,
 session_id VARCHAR(250) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
 intent_id VARCHAR(250) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
 operation_id CHAR(36) NULL UNIQUE, history_id INT NULL UNIQUE,
 event_id VARCHAR(250) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 fulfilled_at DATETIME NULL,
 UNIQUE KEY pwu_stripe_request(account_id,request_id),
 CHECK(account_id>0 AND amount_cents BETWEEN 100 AND 2000000 AND credits BETWEEN 1 AND 26000)
) ENGINE=InnoDB;

CREATE TABLE pwu_stripe_reviews (
 event_id VARCHAR(250) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 intent_id VARCHAR(250) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 event_type VARCHAR(80) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 resolved_at DATETIME NULL, resolution VARCHAR(255) NULL,
 KEY pwu_stripe_review_intent(intent_id,resolved_at)
) ENGINE=InnoDB;

DELIMITER $$
CREATE PROCEDURE pwu_stripe_create(IN p_account INT,IN p_request CHAR(36),IN p_package VARCHAR(32),IN p_amount INT,IN p_credits INT)
SQL SECURITY DEFINER
BEGIN
 DECLARE v_account INT DEFAULT NULL;
 DECLARE v_reference CHAR(36); DECLARE v_package VARCHAR(32); DECLARE v_amount INT; DECLARE v_credits INT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 IF p_account IS NULL OR p_account<1 OR p_request IS NULL OR p_request NOT REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR p_package IS NULL OR p_package NOT IN ('custom','plus','premium','master','ultra','legend','mythic')
 OR p_amount IS NULL OR p_amount NOT BETWEEN 100 AND 2000000 OR p_credits IS NULL OR p_credits NOT BETWEEN 1 AND 26000 THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='stripe-invalid-order'; END IF;
 START TRANSACTION;
 -- Serialize creation on this account, including retries with the same request ID.
 SELECT id INTO v_account FROM accounts WHERE id=p_account FOR UPDATE;
 IF v_account IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='stripe-account-missing'; END IF;
 IF EXISTS(SELECT 1 FROM pwu_stripe_orders o JOIN pwu_stripe_reviews r ON r.intent_id=o.intent_id WHERE o.account_id=p_account AND r.resolved_at IS NULL) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='stripe-account-review'; END IF;
 SELECT reference,package_id,amount_cents,credits INTO v_reference,v_package,v_amount,v_credits
 FROM pwu_stripe_orders WHERE account_id=p_account AND request_id=p_request FOR UPDATE;
 IF v_reference IS NULL THEN
  SET v_reference=UUID();
  INSERT INTO pwu_stripe_orders(reference,request_id,account_id,package_id,amount_cents,credits)
   VALUES(v_reference,p_request,p_account,p_package,p_amount,p_credits);
 ELSEIF NOT (BINARY v_package <=> BINARY p_package) OR v_amount<>p_amount OR v_credits<>p_credits THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='stripe-request-conflict';
 END IF;
 COMMIT;
 SELECT * FROM pwu_stripe_orders WHERE reference=v_reference;
END$$

CREATE PROCEDURE pwu_stripe_read(IN p_reference CHAR(36))
SQL SECURITY DEFINER
BEGIN
 SELECT * FROM pwu_stripe_orders WHERE reference=p_reference;
END$$

CREATE PROCEDURE pwu_stripe_bind(IN p_account INT,IN p_reference CHAR(36),IN p_session VARCHAR(250))
SQL SECURITY DEFINER
BEGIN
 DECLARE v_account INT DEFAULT NULL; DECLARE v_session VARCHAR(250);
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 IF p_account IS NULL OR p_session IS NULL OR p_session NOT REGEXP '^cs_live_[A-Za-z0-9]+$' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='stripe-binding-invalid'; END IF;
 START TRANSACTION;
 SELECT account_id,session_id INTO v_account,v_session FROM pwu_stripe_orders WHERE reference=p_reference FOR UPDATE;
 IF v_account IS NULL OR v_account<>p_account OR (v_session IS NOT NULL AND BINARY v_session<>BINARY p_session) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='stripe-binding-mismatch'; END IF;
 UPDATE pwu_stripe_orders SET session_id=p_session WHERE reference=p_reference;
 COMMIT;
END$$

CREATE PROCEDURE pwu_stripe_fulfill(IN p_reference CHAR(36),IN p_account INT,IN p_session VARCHAR(250),IN p_event VARCHAR(250),IN p_amount INT,IN p_currency VARCHAR(10),IN p_intent VARCHAR(250))
SQL SECURITY DEFINER
BEGIN
 DECLARE v_account INT DEFAULT NULL; DECLARE v_credits INT; DECLARE v_amount INT; DECLARE v_package VARCHAR(32);
 DECLARE v_session VARCHAR(250); DECLARE v_intent VARCHAR(250); DECLARE v_operation CHAR(36); DECLARE v_history INT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 IF p_account IS NULL OR p_session IS NULL OR p_session NOT REGEXP '^cs_live_[A-Za-z0-9]+$'
 OR p_event IS NULL OR p_event NOT REGEXP '^evt_[A-Za-z0-9]+$'
 OR p_intent IS NULL OR p_intent NOT REGEXP '^pi_[A-Za-z0-9]+$'
 OR p_amount IS NULL OR p_currency IS NULL OR BINARY p_currency<>'brl' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='stripe-invalid-payment'; END IF;
 START TRANSACTION;
 SELECT account_id,credits,amount_cents,package_id,session_id,intent_id,operation_id
 INTO v_account,v_credits,v_amount,v_package,v_session,v_intent,v_operation
 FROM pwu_stripe_orders WHERE reference=p_reference FOR UPDATE;
 IF v_account IS NULL OR v_account<>p_account OR v_amount<>p_amount
 OR (v_session IS NOT NULL AND BINARY v_session<>BINARY p_session)
 OR (v_intent IS NOT NULL AND BINARY v_intent<>BINARY p_intent) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='stripe-payment-mismatch'; END IF;
 IF v_operation IS NOT NULL THEN
  COMMIT; SELECT 0 AS credited;
 ELSE
  IF EXISTS(SELECT 1 FROM pwu_stripe_reviews WHERE intent_id=p_intent AND resolved_at IS NULL) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='stripe-payment-review'; END IF;
  SET v_operation=UUID();
  -- Existing BEFORE INSERT trigger locks and adjusts the canonical wallet atomically.
  INSERT INTO pwu_diamond_operations(operation_id,source_account,target_account,amount,reason)
   VALUES(v_operation,NULL,v_account,v_credits,'stripe_live');
  INSERT INTO historico_pagamentos(payment_id,tipo,account_id,player_id,currency,valor,id_pacote,multiplicador,promocional_id,status,entregue,date_created,pwu_package_id,pwu_amount_cents,pwu_reference,pwu_credit_unit)
   VALUES(p_session,'stripe',v_account,NULL,'BRL',v_credits,NULL,1,0,1,1,UTC_TIMESTAMP(),v_package,v_amount,p_reference,'account_diamond_points');
  SET v_history=LAST_INSERT_ID();
  UPDATE pwu_stripe_orders SET session_id=p_session,intent_id=p_intent,operation_id=v_operation,history_id=v_history,event_id=p_event,fulfilled_at=UTC_TIMESTAMP() WHERE reference=p_reference;
  COMMIT; SELECT 1 AS credited;
 END IF;
END$$

CREATE PROCEDURE pwu_stripe_flag(IN p_event VARCHAR(250),IN p_intent VARCHAR(250),IN p_type VARCHAR(80))
SQL SECURITY DEFINER
BEGIN
 IF p_event IS NULL OR p_event NOT REGEXP '^evt_[A-Za-z0-9]+$' OR p_intent IS NULL OR p_intent NOT REGEXP '^pi_[A-Za-z0-9]+$'
 OR p_type IS NULL OR p_type NOT IN ('charge.refunded','charge.dispute.created','charge.dispute.closed') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='stripe-review-invalid'; END IF;
 INSERT INTO pwu_stripe_reviews(event_id,intent_id,event_type) VALUES(p_event,p_intent,p_type)
 ON DUPLICATE KEY UPDATE event_id=VALUES(event_id);
 SELECT 1 AS recorded;
END$$
DELIMITER ;
