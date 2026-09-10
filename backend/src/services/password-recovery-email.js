'use strict';

const EMAIL_SUBJECT = 'Código de recuperação de senha - CASEG Protege';

function deliveryFailed() {
  return {
    ok: false,
    reason: 'DELIVERY_FAILED',
  };
}

function buildPasswordRecoveryText(code) {
  return [
    'Este é o seu código de recuperação de senha da CASEG Protege:',
    '',
    code,
    '',
    'Este código é válido por até 10 minutos.',
    'Se você não solicitou esta recuperação, ignore este e-mail.',
    'Nunca responda a este e-mail informando sua senha.',
  ].join('\n');
}

function createPasswordRecoveryEmailService(options = {}) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('Invalid password recovery email service configuration.');
  }

  const { transport, fromAddress, captureSink } = options;

  if (!transport || typeof transport.sendMail !== 'function') {
    throw new TypeError('Invalid password recovery email transport.');
  }

  if (typeof fromAddress !== 'string' || fromAddress.trim().length === 0) {
    throw new TypeError('Invalid password recovery email sender.');
  }

  if (captureSink !== undefined && typeof captureSink !== 'function') {
    throw new TypeError('Invalid password recovery email capture sink.');
  }

  const sender = fromAddress.trim();

  async function sendPasswordRecoveryCode(input = {}) {
    if (!input || typeof input !== 'object') {
      return deliveryFailed();
    }

    const { recipient, code } = input;

    if (
      typeof recipient !== 'string' ||
      recipient.trim().length === 0 ||
      typeof code !== 'string' ||
      code.length === 0
    ) {
      return deliveryFailed();
    }

    try {
      const info = await transport.sendMail({
        from: sender,
        to: recipient.trim(),
        subject: EMAIL_SUBJECT,
        text: buildPasswordRecoveryText(code),
      });

      if (captureSink) {
        await captureSink(info);
      }

      return { ok: true };
    } catch {
      return deliveryFailed();
    }
  }

  return {
    sendPasswordRecoveryCode,
  };
}

function createPasswordRecoveryJsonTransport() {
  const nodemailer = require('nodemailer');

  return nodemailer.createTransport({
    jsonTransport: true,
    logger: false,
    debug: false,
  });
}

module.exports = {
  createPasswordRecoveryEmailService,
  createPasswordRecoveryJsonTransport,
};