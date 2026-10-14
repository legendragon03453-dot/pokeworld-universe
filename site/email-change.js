(function () {
  'use strict';
  var host = document.getElementById('email-change-body');
  if (!host || !window.PWU || !PWU.auth) return;
  var api = PWU.auth.api, badge = document.getElementById('email-change-badge');
  var completion = document.getElementById('email-change-complete');
  var revision = 0, owner = null, state = null, mode = '', busy = false, completed = false, codeExpiresAt = null;
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  var STATES = ['awaiting_current', 'waiting', 'awaiting_new', 'completed', 'cancelled', 'expired'];
  function node(tag, text, className) {
    var item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  }
  function current(version) { return version === revision && owner && PWU.auth.user && String(PWU.auth.user.id) === owner; }
  function clearInputs() { host.querySelectorAll('input').forEach(function (input) { input.value = ''; }); }
  function clearBody() { clearInputs(); host.replaceChildren(); }
  function date(value) { return new Date(value).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}); }
  function validState(value) {
    if (!value || typeof value.available !== 'boolean' || typeof value.needsTotp !== 'boolean' ||
        (value.autoCompletion !== undefined && typeof value.autoCompletion !== 'boolean') ||
        !(typeof value.currentEmailMasked === 'string' || (value.available === false && value.currentEmailMasked === null))) return false;
    if (value.securityDelayHours !== null && (!Number.isFinite(value.securityDelayHours) || value.securityDelayHours <= 0)) return false;
    var request = value.request;
    return request === null || (!!request && UUID.test(request.requestId) && STATES.indexOf(request.status) !== -1 &&
      typeof request.newEmailMasked === 'string' && Number.isFinite(request.createdAt) && Number.isFinite(request.expiresAt) &&
      (request.dueAt === null || Number.isFinite(request.dueAt)) && typeof request.canRequestNewCode === 'boolean' && typeof request.canCancel === 'boolean' &&
      (request.autoCompletion === undefined || typeof request.autoCompletion === 'boolean') &&
      (request.workerBlocked === undefined || typeof request.workerBlocked === 'boolean'));
  }
  function stateFrom(result) {
    var value = result && (result.state || result);
    if (!validState(value)) throw new Error('Não foi possível confirmar a situação da troca. Atualize esta área antes de continuar.');
    return value;
  }
  function button(label, callback, className) {
    var item = node('button', label, className || 'email-change__quiet'); item.type = 'button';
    item.addEventListener('click', function () { if (!busy) callback(); }); return item;
  }
  function setMode(value) { mode = value; render(); var field = host.querySelector('input'); if (field) field.focus({preventScroll:true}); }
  function refresh(options) {
    var previous = options && options.preserveChallenge && state && state.request ? {owner:owner,requestId:state.request.requestId,status:state.request.status,mode:mode,codeExpiresAt:codeExpiresAt} : null;
    var version = ++revision; owner = PWU.auth.user && String(PWU.auth.user.id); busy = false; mode = ''; state = null; codeExpiresAt = null; clearBody();
    if (!owner) { badge.textContent = 'Entre na conta'; return; }
    badge.textContent = 'Carregando…'; host.appendChild(node('p', 'Conferindo a situação do seu e-mail…', 'email-change__note'));
    return api.emailChangeState().then(function (result) {
      if (!current(version)) return; state = stateFrom(result);
      if (previous && previous.owner === owner && state.request && previous.requestId === state.request.requestId && previous.status === state.request.status && Number.isFinite(previous.codeExpiresAt) && previous.codeExpiresAt > Date.now()) {
        codeExpiresAt = previous.codeExpiresAt;
        if (previous.mode === 'cancel' && state.request.canCancel) mode = 'cancel';
      }
      render();
    }).catch(function (error) {
      if (!current(version)) return; clearBody(); badge.textContent = 'Indisponível';
      host.appendChild(node('p', error.offline ? 'Não foi possível conectar. Tente atualizar esta área.' : 'Não foi possível conferir a troca de e-mail agora.', 'email-change__note'));
      host.appendChild(button('Atualizar situação', refresh));
    });
  }
  function delayLabel(hours) {
    if (hours % 24 === 0) {
      var days = hours / 24;
      return days + (days === 1 ? ' dia' : ' dias');
    }
    return hours + (hours === 1 ? ' hora' : ' horas');
  }
  function summary(request) {
    var aside = node('aside', undefined, 'email-change__summary'), list = node('dl');
    function entry(label, value, isDate) { var box = node('div'); box.appendChild(node('dt', label)); box.appendChild(node('dd', value, isDate ? 'email-change__date' : '')); list.appendChild(box); }
    entry('E-mail atual', state.currentEmailMasked || 'Não disponível');
    if (request) entry('Novo e-mail', request.newEmailMasked);
    if (request && request.dueAt !== null) entry(request.autoCompletion ? 'Troca automática em' : 'Confirmação liberada a partir de', date(request.dueAt), true);
    else if (request && state.securityDelayHours !== null) entry('Prazo de segurança', delayLabel(state.securityDelayHours) + (request.autoCompletion ? ' após confirmar os dois e-mails' : ' após confirmar o e-mail atual'));
    if (request && !(request.autoCompletion && request.status === 'waiting')) entry('Validade desta solicitação', date(request.expiresAt), true);
    aside.appendChild(list); return aside;
  }
  function steps(active, automatic) {
    var list = node('ol', undefined, 'email-change__steps'); list.setAttribute('aria-label','Etapas da troca de e-mail');
    (automatic ? ['E-mail atual','Novo e-mail','Prazo de segurança'] : ['E-mail atual','Prazo de segurança','Novo e-mail']).forEach(function (label, index) {
      var item = node('li'); if (index === active) item.setAttribute('aria-current','step'); if (index < active) item.className = 'is-complete'; var number = node('i', String(index+1)); number.setAttribute('aria-hidden','true'); item.appendChild(number); item.appendChild(node('span',label)); list.appendChild(item);
    }); return list;
  }
  function completedResult(result) {
    if (result.ok !== true || result.status !== 'completed') throw new Error('Resultado não confirmado. Atualize a situação da troca antes de tentar novamente.');
    completed = true; ++revision; state = null; mode = ''; clearBody(); completion.replaceChildren(); completion.hidden = false;
    var title = node('h2','E-mail atualizado'); title.tabIndex = -1; completion.appendChild(title);
    completion.appendChild(node('p','A troca foi concluída. Use o novo e-mail na próxima entrada.'));
    completion.appendChild(node('p','As sessões e os aparelhos autorizados do site foram encerrados para proteger sua conta.'));
    var link = node('a','Entrar com meu novo e-mail','btn btn--yellow btn--sm'); link.href = 'login.html'; completion.appendChild(link);
    document.body.classList.add('email-change-completed');
    if (result.sessionEnded === true) PWU.auth.endLocalSession();
    title.focus();
  }
  function formFor(panel, kind, request) {
    var form = node('form',undefined,'email-change__form'); form.noValidate = true; form.autocomplete = 'off';
    var labels = {
      start:['Trocar e-mail','Informe o novo endereço e confirme sua senha. Primeiro, vamos validar o e-mail atual.','Enviar código ao e-mail atual'],
      current:['Confirme o e-mail atual','Use o código do seu e-mail atual para autorizar o início do prazo de segurança.','Confirmar e iniciar prazo'],
      resendCurrent:['Reenviar código','Informe novamente o endereço de destino solicitado e sua senha. O código será enviado ao e-mail atual.','Reenviar ao e-mail atual'],
      requestNew:['Valide o novo endereço','O prazo foi concluído. Confirme sua senha para receber um código no novo e-mail.','Enviar código ao novo e-mail'],
      new:['Confirme o novo e-mail','Use o código recebido no novo endereço. A troca só será concluída após esta confirmação.','Concluir troca de e-mail'],
      cancelRequest:['Confirmar cancelamento','Enviaremos um código ao seu e-mail atual para confirmar o cancelamento.','Enviar código ao e-mail atual'],
      cancel:['Cancelar a solicitação','O endereço atual será mantido e esta solicitação deixará de valer.','Confirmar cancelamento']
    }, copy = labels[kind];
    if (request && request.autoCompletion) {
      if (kind === 'current') copy = ['Confirme o e-mail atual','Digite o código enviado ao endereço atual. Depois, confirme o novo e-mail.','Confirmar e-mail atual'];
      if (kind === 'requestNew') copy = ['Confirme o novo endereço','Envie um código ao novo e-mail para confirmar que você tem acesso a ele.','Enviar código ao novo e-mail'];
      if (kind === 'new') copy = ['Confirme o novo e-mail','Após esta confirmação, a troca será feita automaticamente em '+delayLabel(state.securityDelayHours)+'.','Confirmar e agendar troca'];
    }
    form.appendChild(node('h3',copy[0])); form.appendChild(node('p',copy[1]));
    var fields = {};
    function field(name, label, type, parent) {
      var wrapper = node('label',undefined,'field'), input = node('input'); input.name = name; input.type = type; input.required = true;
      input.autocomplete = type === 'password' ? 'current-password' : 'off';
      input.maxLength = type === 'password' ? 1024 : (type === 'email' ? 254 : 6);
      if (type === 'text') { input.inputMode = 'numeric'; input.pattern = '[0-9]{6}'; input.addEventListener('input',function(){input.value=input.value.replace(/\D/g,'');}); }
      wrapper.appendChild(node('span',label)); wrapper.appendChild(input); (parent || form).appendChild(wrapper); fields[name] = input; return input;
    }
    if (kind === 'start' || kind === 'resendCurrent') field('newEmail','Novo e-mail','email');
    field('password','Senha atual','password');
    var needsCode = kind === 'current' || kind === 'new' || (kind === 'cancel' && !state.needsTotp);
    if (needsCode || (kind === 'cancel' && state.needsTotp)) {
      var codes = node('div',undefined,state.needsTotp && needsCode ? 'email-change__codes' : ''); form.appendChild(codes);
      if (needsCode) field('code',kind === 'new' ? 'Código do novo e-mail' : 'Código do e-mail atual','text',codes);
      if (state.needsTotp) field('totp','Código do aplicativo','text',codes);
    }
    if (needsCode && Number.isFinite(codeExpiresAt)) form.appendChild(node('p','Validade do código: '+date(codeExpiresAt)+'.','email-change__note'));
    var message = node('div',undefined,'email-change__message'); message.setAttribute('role','alert'); form.appendChild(message);
    var actions = node('div',undefined,'email-change__actions'), submit = node('button',copy[2],'btn btn--yellow btn--sm'); submit.type = 'submit'; actions.appendChild(submit);
    if (kind !== 'current' && kind !== 'new') actions.appendChild(button('Voltar',function(){setMode('');}));
    if (kind === 'current') actions.appendChild(button('Reenviar código',function(){setMode('resendCurrent');}));
    if (kind === 'new' && request.canRequestNewCode) actions.appendChild(button('Reenviar código',function(){setMode('requestNew');}));
    form.appendChild(actions); panel.appendChild(form);
    var reference = request ? request.requestId : (window.crypto && crypto.randomUUID ? crypto.randomUUID() : null);
    form.addEventListener('submit',function(event){
      event.preventDefault(); if (busy) return;
      if (!form.reportValidity()) return;
      if (!reference || !UUID.test(reference)) { message.textContent = 'Não foi possível iniciar uma solicitação segura neste navegador.'; return; }
      if ((fields.code && !/^\d{6}$/.test(fields.code.value)) || (fields.totp && !/^\d{6}$/.test(fields.totp.value))) { message.textContent = 'Informe os seis dígitos de cada código solicitado.'; return; }
      var version = revision, value = {requestId:reference,password:fields.password.value}, method;
      if (fields.newEmail) value.newEmail = fields.newEmail.value.trim();
      if (fields.code) value.code = fields.code.value;
      if (fields.totp) value.totp = fields.totp.value;
      if (kind === 'start' || kind === 'resendCurrent') method = 'emailChangeRequest';
      else if (kind === 'current') method = 'emailChangeConfirmCurrent';
      else if (kind === 'requestNew') method = 'emailChangeRequestNew';
      else if (kind === 'new') method = 'emailChangeConfirmNew';
      else if (kind === 'cancelRequest') method = 'emailChangeCancelRequest';
      else method = 'emailChangeCancel';
      busy = true; message.textContent = ''; host.querySelectorAll('button').forEach(function(item){item.disabled=true;});
      api[method](value).then(function(result){
        if (!current(version)) return;
        if (kind === 'new' && result.status === 'completed') { completedResult(result); return; }
        state = stateFrom(result); codeExpiresAt = Number.isFinite(result.codeExpiresAt) ? result.codeExpiresAt : null; mode = kind === 'cancelRequest' && result.needsEmail === true ? 'cancel' : ''; render();
      }).catch(function(error){
        if (!current(version) || !form.isConnected) return;
        clearInputs();
        if (error.status === 401) { PWU.auth.endLocalSession(); return; }
        if (error.status === 422) {
          message.textContent = error.message || 'Confira a senha e os códigos e tente novamente.';
          host.querySelectorAll('button').forEach(function(item){item.disabled=false;});
        } else {
          message.textContent = error.status === 429 ? 'Aguarde antes de tentar novamente. Atualize a situação para continuar.' : error.status === 409 ? 'A situação desta solicitação mudou. Atualize antes de continuar.' : 'Não foi possível confirmar o resultado. Atualize a situação antes de repetir qualquer confirmação.';
          actions.appendChild(button('Atualizar situação',refresh));
        }
      }).finally(function(){delete value.password;delete value.code;delete value.totp;delete value.newEmail;if (version === revision) busy=false;});
    });
  }
  function render() {
    clearBody(); busy = false; if (!state) return;
    var request = state.request, pending = request && ['awaiting_current','waiting','awaiting_new'].indexOf(request.status) !== -1;
    var automatic = pending ? request.autoCompletion === true : state.autoCompletion === true;
    var names = {awaiting_current:'Confirme o e-mail',waiting:'Prazo de segurança',awaiting_new:'Confirme o novo e-mail',completed:'Troca concluída',cancelled:'Solicitação cancelada',expired:'Solicitação expirada'};
    badge.textContent = request ? names[request.status] : (state.available ? 'Endereço protegido' : 'Indisponível');
    var layout = node('div',undefined,'email-change__layout'), panel = node('div',undefined,'email-change__info'); layout.appendChild(summary(pending ? request : null)); layout.appendChild(panel); host.appendChild(layout);
    if ((mode === 'cancel' || mode === 'cancelRequest') && pending && request.canCancel) formFor(panel,mode,request);
    else if (!state.available || state.securityDelayHours === null) {
      panel.appendChild(node('h3','Troca de e-mail indisponível'));
      panel.appendChild(node('p',pending && request.canCancel ? 'As próximas etapas estão indisponíveis no momento. Seu e-mail permanece o mesmo e você ainda pode cancelar esta solicitação.' : 'O endereço atual permanece o mesmo. Tente novamente quando esta opção estiver disponível.'));
      panel.appendChild(button('Atualizar situação',refresh));
    }
    else if (mode === 'resendCurrent' && pending && request.status === 'awaiting_current') formFor(panel,'resendCurrent',request);
    else if (mode === 'requestNew' && pending && request.canRequestNewCode) formFor(panel,'requestNew',request);
    else if (!pending) {
      if (mode === 'start') formFor(panel,'start',null);
      else {
        layout.classList.add('email-change__layout--overview');
        if (request && (request.status === 'cancelled' || request.status === 'expired')) {
          panel.appendChild(node('p',request.status === 'cancelled' ? 'O e-mail atual foi mantido.' : 'Solicitação expirada.','email-change__overview-status'));
        }
        panel.appendChild(button('Trocar e-mail',function(){setMode('start');},'btn btn--yellow btn--sm'));
        var help = node('section',undefined,'email-change__help');
        help.appendChild(node('h3','Como funciona'));
        var instructions = node('ul',undefined,'email-change__instructions');
        (automatic ? ['Digite seu novo e-mail e senha atual.','Confirme os códigos enviados ao e-mail atual e ao novo.','A troca será concluída automaticamente após o período de segurança.','Você pode cancelar a solicitação durante a espera.'] : ['Digite seu novo e-mail e senha atual.','Verifique o código enviado para seu e-mail atual.','Aguarde o período de segurança ser concluído.','Confirme ou cancele a alteração de e-mail.']).forEach(function(text){instructions.appendChild(node('li',text));});
        help.appendChild(instructions); host.appendChild(help);
      }
    } else if (request.status === 'awaiting_current') formFor(panel,'current',request);
    else if (request.status === 'awaiting_new') formFor(panel,automatic && !Number.isFinite(codeExpiresAt) ? 'requestNew' : 'new',request);
    else if (automatic) {
      panel.appendChild(node('h3',request.workerBlocked ? 'Solicitação precisa ser refeita' : 'Troca de e-mail agendada'));
      panel.appendChild(node('p',request.workerBlocked ? 'A proteção da conta mudou ou não foi possível validar a solicitação. Cancele esta troca e inicie uma nova.' : 'Os dois e-mails foram confirmados. A troca será feita automaticamente após '+delayLabel(state.securityDelayHours)+', mesmo que você não entre no site.'));
      if (!request.workerBlocked) panel.appendChild(node('p','Até lá, o e-mail atual continua ativo.','email-change__note'));
      panel.appendChild(button('Atualizar situação',refresh));
    }
    else {
      panel.appendChild(node('h3',request.canRequestNewCode ? 'Pronto para confirmar o novo e-mail' : 'Prazo de segurança em andamento'));
      panel.appendChild(node('p',request.canRequestNewCode ? 'Confirme o novo endereço para concluir. Até lá, sua conta continua usando o e-mail atual.' : 'Seu e-mail ainda não foi alterado. Quando o prazo terminar, atualize esta área para confirmar o novo endereço.'));
      var next = node('div',undefined,'email-change__actions');
      if (request.canRequestNewCode) next.appendChild(button('Confirmar novo e-mail',function(){setMode('requestNew');},'btn btn--yellow btn--sm'));
      next.appendChild(button('Atualizar situação',refresh)); panel.appendChild(next);
    }
    if (pending && mode !== 'cancel' && mode !== 'cancelRequest' && request.canCancel) {
      var cancelRow = node('div',undefined,'email-change__actions'); cancelRow.appendChild(button('Cancelar solicitação',function(){setMode(state.needsTotp ? 'cancel' : 'cancelRequest');},'email-change__quiet email-change__cancel')); panel.appendChild(cancelRow);
    }
    host.prepend(steps(!pending || request.status === 'awaiting_current' ? 0 : automatic ? (request.status === 'awaiting_new' ? 1 : 2) : (request.status === 'waiting' ? 1 : 2), automatic));
  }
  document.addEventListener('auth:change',function(){
    if (completed && !PWU.auth.user) { ++revision; owner=null;clearBody();return; }
    completed=false;completion.hidden=true;completion.replaceChildren();document.body.classList.remove('email-change-completed');refresh();
  });
  document.addEventListener('visibilitychange',function(){
    if (document.hidden) { ++revision;busy=false;clearInputs(); }
    else if (!completed) refresh({preserveChallenge:true});
  });
  window.addEventListener('pagehide',function(){++revision;clearInputs();});
  Promise.resolve(PWU.auth.ready).then(refresh);
})();
