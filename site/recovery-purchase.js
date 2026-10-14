(function () {
  'use strict';
  var area = document.getElementById('recovery-purchase');
  if (!area || !window.PWU || !PWU.auth) return;
  var standalone = document.body.dataset.page === 'comprar-rk', pageStatus = document.getElementById('rk-purchase-page-status');
  var button = document.getElementById('recovery-purchase-open'), owner = null, revision = 0, state = null, modal = null, completed = false;
  function current(version) { return version === revision && owner && PWU.auth.user && String(PWU.auth.user.id) === owner; }
  function element(tag, text, className) { var node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
  function close() { if (modal) { var form = modal.querySelector('form'); if (form) form.reset(); if (typeof modal.close === 'function') modal.close(); modal.remove(); modal = null; } }
  function pageNotice(text,href,label) {
    if (!pageStatus) return;
    pageStatus.replaceChildren(element('p',text));pageStatus.hidden=false;
    if(href){var link=element('a',label,'btn btn--yellow btn--sm');link.href=href;pageStatus.appendChild(link);}
  }
  function validState(value) { return value && value.available === true && value.price === 30 && Number.isSafeInteger(value.balance) && value.balance >= 0 && Number.isSafeInteger(value.keyVersion) && typeof value.needsTotp === 'boolean'; }
  function refresh() {
    var version = ++revision; owner = PWU.auth.user && String(PWU.auth.user.id); state = null; area.hidden = true; button.disabled = true;
    if (!owner) { pageNotice('Entre na sua conta para conferir o saldo e comprar sua nova Recovery Key.','login.html','Entrar na minha conta'); return Promise.resolve(); }
    return PWU.auth.api.recoveryPurchaseState().then(function (result) {
      if (!current(version)) return;
      if (result && result.available === false && result.keyVersion === null) { pageNotice('Sua primeira Recovery Key é gratuita. Crie e guarde sua chave na página de Segurança.','seguranca.html','Criar minha primeira chave');return; }
      if (!validState(result)) throw new Error('Não foi possível conferir os dados da compra. Tente novamente mais tarde.');
      state = result; area.hidden = false; button.disabled = false;
      if(pageStatus)pageStatus.hidden=true;
      var previous = document.getElementById('recovery-purchase-last'), purchase = result.lastPurchase;
      previous.hidden = !(purchase && purchase.status === 'completed' && purchase.price === 30 && Number.isFinite(purchase.completedAt));
      previous.textContent = previous.hidden ? '' : 'Última substituição concluída: 30 Pcoins em ' + new Date(purchase.completedAt).toLocaleString('pt-BR') + '.';
      if(standalone)button.click();
    }).catch(function (error) { if(current(version))pageNotice(error.message && !error.offline ? error.message : 'A compra de Recovery Key está temporariamente indisponível. Nenhuma compra foi iniciada.','minha-conta.html','Voltar para minha conta'); });
  }
  function success(result) {
    var purchase = result && result.receipt;
    if (!purchase || purchase.status !== 'completed' || purchase.price !== 30) throw new Error('Resultado não confirmado. Entre novamente e consulte a última compra antes de tentar outra vez.');
    completed = true;
    var form = modal.querySelector('form'); if (form) form.reset(); modal.replaceChildren();
    var heading = element('h2', result.replayed ? 'Compra já concluída' : 'Sua chave foi substituída'); heading.id = 'rk-purchase-title'; modal.appendChild(heading);
    modal.appendChild(element('p', 'Foram debitados 30 Pcoins nesta compra. Sua chave anterior não funciona mais.'));
    modal.appendChild(element('p', result.emailStatus === 'sent' ? 'A nova chave foi enviada ao e-mail da sua conta.' : 'Confira a nova chave ao entrar novamente. O envio por e-mail pode estar pendente; não é necessário comprar outra chave.'));
    modal.appendChild(element('p', 'As sessões e os aparelhos autorizados do site foram revogados. Sua senha e a proteção do jogo continuam iguais.', 'rk-dialog__note'));
    var actions = element('div', undefined, 'rk-dialog__actions'), login = element('a', 'Entrar e guardar minha chave', 'btn btn--yellow'); login.href = 'login.html'; actions.appendChild(login); modal.appendChild(actions);
    if (result.sessionEnded === true) PWU.auth.endLocalSession();
    login.focus();
  }
  button.addEventListener('click', function () {
    if (button.disabled || !state || !window.crypto || typeof crypto.randomUUID !== 'function') return;
    var version = revision, reference = crypto.randomUUID(), keyVersion = state.keyVersion, requested = false, busy = false, uncertain = false;
    close(); completed = false; modal = element(standalone ? 'section' : 'dialog', undefined, 'rk-dialog'+(standalone?' rk-dialog--page':'')); modal.setAttribute('aria-labelledby','rk-purchase-title');
    var heading = element('h2',standalone?'Confirmar compra':'Substituir Recovery Key'); heading.id = 'rk-purchase-title'; modal.appendChild(heading);
    modal.appendChild(element('p','Sua nova chave invalida a anterior e encerra as sessões do site. A primeira chave continua gratuita; esta compra é apenas para substituí-la.'));
    var price = element('div',undefined,'rk-dialog__price'), cost = element('span'), balance = element('span');
    cost.append(element('small','Valor da substituição'),element('b','30 Pcoins')); balance.append(element('small','Seu saldo'),element('b',state.balance.toLocaleString('pt-BR')+' Pcoins')); price.append(cost,balance); modal.appendChild(price);
    var form = element('form'); form.noValidate = true; modal.appendChild(form);
    function field(name, label, type) {
      var wrapper = element('label',undefined,'field'), input = element('input'); input.name = name; input.type = type; input.required = true;
      input.autocomplete = name === 'password' ? 'current-password' : 'one-time-code';
      if (type !== 'password') { input.inputMode = 'numeric'; input.maxLength = 6; input.addEventListener('input',function(){input.value=input.value.replace(/\D/g,'');}); }
      wrapper.append(element('span',label),input); form.appendChild(wrapper); return wrapper;
    }
    var passwordField = field('password','Senha atual','password'), codeField = field('code','Código enviado ao e-mail','text'), totpField = field('totp','Código do aplicativo autenticador','text'); codeField.hidden = true; totpField.hidden = true;
    var consent = element('label',undefined,'rk-dialog__consent'), checkbox = element('input'); checkbox.name = 'confirmed'; checkbox.type = 'checkbox'; consent.append(checkbox,element('span','Confirmo a substituição da minha Recovery Key por 30 Pcoins.')); form.appendChild(consent);
    var note = element('p','Sua chave antiga não é necessária. Confirme sua senha e o código de e-mail; se usa aplicativo, o código dele também será pedido.','rk-dialog__note'); form.appendChild(note);
    var message = element('p',undefined,'rk-dialog__message'); message.hidden = true; message.setAttribute('role','alert'); form.appendChild(message);
    var actions = element('div',undefined,'rk-dialog__actions'), submit = element('button',standalone?'Continuar · 30 Pcoins':'Enviar código de confirmação','btn btn--yellow'), cancel = element('button','Cancelar','btn btn--ghost'); submit.type = 'submit'; cancel.type = 'button'; actions.append(submit,cancel); form.appendChild(actions);
    cancel.addEventListener('click',function(){if(!busy){close();if(standalone)location.assign('minha-conta.html');}});
    modal.addEventListener('cancel',function(event){if(busy)event.preventDefault();});
    modal.addEventListener('close',function(){if(form.isConnected)form.reset();});
    form.addEventListener('submit',function(event){
      event.preventDefault(); if (busy || !current(version)) return;
      message.hidden = true;
      var value = {requestId:reference,keyVersion:keyVersion,password:form.elements.password.value,code:form.elements.code.value,totp:form.elements.totp.value,confirmed:checkbox.checked,price:30};
      var error = !value.password ? 'Confirme sua senha atual.' : !value.confirmed ? 'Marque a confirmação do valor antes de continuar.' : state.balance < 30 ? 'Seu saldo é insuficiente para esta substituição.' : requested && !/^\d{6}$/.test(value.code) ? 'Digite o código de seis dígitos enviado ao e-mail.' : requested && !totpField.hidden && !/^\d{6}$/.test(value.totp) ? 'Digite os seis dígitos do aplicativo.' : '';
      if(error){message.textContent=error;message.hidden=false;return;}
      busy=true;submit.disabled=true;cancel.disabled=true;
      (requested ? PWU.auth.api.recoveryPurchaseConfirm(value) : PWU.auth.api.recoveryPurchaseRequest(value)).then(function(result){
        if(!current(version)||!form.isConnected)return;
        if(result && result.replayed && result.receipt){success(result);return;}
        if(!requested){
          if(!result||result.needsEmail!==true||result.requestId!==reference||result.price!==30||typeof result.needsTotp!=='boolean')throw new Error('Não foi possível confirmar o envio. Reabra esta etapa.');
          requested=true;codeField.hidden=false;totpField.hidden=!result.needsTotp;submit.textContent=standalone?'Comprar RK · 30 Pcoins':'Confirmar compra · 30 Pcoins';
          note.textContent='Código enviado para '+state.emailMasked+'. Só o botão de confirmar conclui a cobrança.';form.elements.code.focus();
        }else{
          if(!result||result.ok!==true||!result.receipt)throw new Error('Resultado não confirmado. Entre novamente e consulte a última compra antes de tentar outra vez.');
          success(result);
        }
      }).catch(function(error){
        if(!current(version)||!form.isConnected)return;
        uncertain=requested&&(error.offline===true||error.status===401||error.status>=500||!error.status);
        message.textContent=uncertain?'Não foi possível confirmar o resultado. Entre novamente e confira a última substituição antes de iniciar outra compra.':error.message||'Não foi possível continuar.';message.hidden=false;
        if(uncertain){
          form.reset();submit.hidden=true;cancel.textContent='Fechar';var login=element('a','Entrar e conferir','btn btn--yellow');login.href='login.html';actions.appendChild(login);
        }
      }).finally(function(){busy=false;if(form.isConnected){submit.disabled=uncertain;cancel.disabled=false;}});
    });
    (standalone?document.getElementById('rk-purchase-page-body'):document.body).appendChild(modal);
    if(!standalone)modal.showModal();
    passwordField.querySelector('input').focus({preventScroll:standalone});
  });
  document.addEventListener('auth:change',function(){
    if(completed){++revision;owner=null;state=null;area.hidden=!standalone;return;}
    close(); refresh();
  });
  window.addEventListener('pagehide',function(){++revision;close();});
  Promise.resolve(PWU.auth.ready).then(refresh);
})();
