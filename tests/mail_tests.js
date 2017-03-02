
'use strict';

/* global describe it */

const chakram = require('chakram'),
  expect = chakram.expect,
  $ = require('cheerio'),
  mimelib = require('mimelib');

const BASE_URL = 'http://localhost:8000',
  valid_user = require('./data/valid_user');

const findMail = function findMail (mails, address, subject) {
  return mails[mails.findIndex(function (item) {
    return (item.Raw.To[0] === address && item.Content.Headers.Subject.includes(subject));
  })];
};

const findMailAndParseBody = function findMailAndParseBody (mails, address, subject) {
  return $.load(mimelib.decodeQuotedPrintable(findMail(mails, address, subject).Content.Body));
};

describe('mails', function () {
  let mails;

  it('should have sent mails', function () {
    return chakram.get('http://mailhog:8025/api/v2/messages')
      .then(function (response) {
        expect(response).to.have.status(200);
        expect(response).to.have.json('items', function (items) {
          expect(items).to.exist;
          expect(Array.isArray(items)).to.be.true;
          mails = items;
        });

        return chakram.wait();
      });
  });

  it('should allow to confirm email address', function () {
    let token;
    const mail = findMailAndParseBody(mails, valid_user.email, 'Your openSenseMap registration');
    expect(mail).to.exist;
    const links = mail('a');
    links.each(function (_, link) {
      const href = $(link).attr('href');
      if (href.includes('token=')) {
        token = href.split('=')[1];
      }
    });
    expect(token).to.exist;

    return chakram.post(`${BASE_URL}/users/confirm-email`, { token, email: valid_user.email })
      .then(function (response) {
        expect(response).to.have.status(200);
        expect(response).to.have.json({ code: 'Ok', message: 'E-Mail successfully confirmed. Thank you' });

        return chakram.wait();
      });
  });

  it('should deny to confirm email address with used token', function () {
    let token;
    const mail = findMailAndParseBody(mails, valid_user.email, 'Your openSenseMap registration');
    expect(mail).to.exist;
    const links = mail('a');
    links.each(function (_, link) {
      const href = $(link).attr('href');
      if (href.includes('token=')) {
        token = href.split('=')[1];
      }
    });
    expect(token).to.exist;

    return chakram.post(`${BASE_URL}/users/confirm-email`, { token, email: valid_user.email })
      .then(function (response) {
        expect(response).to.have.status(403);
        expect(response).to.have.json({ code: 'ForbiddenError',
          message: 'invalid email confirmation token' });

        return chakram.wait();
      });
  });

  it('should not let users change their password with token if new password is too short', function () {
    let token;
    const mail = findMailAndParseBody(mails, valid_user.email, 'Your password reset');
    expect(mail).to.exist;
    const links = mail('a');
    links.each(function (_, link) {
      const href = $(link).attr('href');
      if (href.includes('token=')) {
        token = href.split('=')[1];
      }
    });
    expect(token).to.exist;

    return chakram.post(`${BASE_URL}/users/password-reset`, { token, email: valid_user.email, password: 'short' })
      .then(function (response) {
        expect(response).to.have.status(422);
        valid_user.password = 'short';

        // try to sign in with new password
        return chakram.post(`${BASE_URL}/users/sign-in`, valid_user);
      })
      .then(function (response) {
        expect(response).to.have.status(401);

        return chakram.wait();
      });
  });

  it('should let users change their password with token', function () {
    let token;
    const mail = findMailAndParseBody(mails, valid_user.email, 'Your password reset');
    expect(mail).to.exist;
    const links = mail('a');
    links.each(function (_, link) {
      const href = $(link).attr('href');
      if (href.includes('token=')) {
        token = href.split('=')[1];
      }
    });
    expect(token).to.exist;

    return chakram.post(`${BASE_URL}/users/password-reset`, { token, email: valid_user.email, password: 'newlongenoughpassword' })
      .then(function (response) {
        expect(response).to.have.status(200);
        expect(response).to.have.json({ code: 'Ok', message: 'Password successfully changed. You can now login with your new password' });
        valid_user.password = 'newlongenoughpassword';

        // try to sign in with new password
        return chakram.post(`${BASE_URL}/users/sign-in`, valid_user);
      })
      .then(function (response) {
        expect(response).to.have.status(200);
        expect(response).to.have.header('content-type', 'application/json; charset=utf-8');
        expect(response.body.token).to.exist;

        return chakram.wait();
      });
  });

  it('should deny password change password with used token', function () {
    let token;
    const mail = findMailAndParseBody(mails, valid_user.email, 'Your password reset');
    expect(mail).to.exist;
    const links = mail('a');
    links.each(function (_, link) {
      const href = $(link).attr('href');
      if (href.includes('token=')) {
        token = href.split('=')[1];
      }
    });
    expect(token).to.exist;

    return chakram.post(`${BASE_URL}/users/password-reset`, { token, email: valid_user.email, password: 'newlongenoughpasswordNOT' })
      .then(function (response) {
        expect(response).to.have.status(403);
        expect(response).to.have.json({ code: 'ForbiddenError',
          message: 'Password reset for this user not possible' });
        valid_user.password = 'newlongenoughpasswordNOT';

        // try to sign in with new password
        return chakram.post(`${BASE_URL}/users/sign-in`, valid_user);
      })
      .then(function (response) {
        expect(response).to.have.status(401);

        return chakram.wait();
      });
  });

  it('should have sent senseBox registration mail with the sketch as attachment', function () {
    const mail = findMail(mails, 'tester3@test.test', 'Your senseBox registration');
    expect(mail).to.exist;
    expect(mail.MIME.Parts).to.not.be.undefined;
    expect(mail.MIME.Parts[1].Body).to.not.be.undefined;
    const ino = mimelib.decodeBase64(mail.MIME.Parts[1].Body);
    const boxId = mail.MIME.Parts[0].Body.substr(mail.MIME.Parts[0].Body.indexOf('Your senseBox ID is: ') + 21, 24);

    // sign in to get jwt
    return chakram.post(`${BASE_URL}/users/sign-in`, { email: 'tester3@test.test', password: '12345678' })
      .then(function (response) {
        expect(response).to.have.status(200);
        expect(response).to.have.header('content-type', 'application/json; charset=utf-8');
        expect(response.body.token).to.exist;

        const jwt = response.body.token;

        return chakram.get(`${BASE_URL}/boxes/${boxId}/script`, { headers: { 'Authorization': `Bearer ${jwt}` } });
      })
      .then(function (response) {
        expect(response).to.have.status(200);
        expect(response.body).not.to.be.empty;
        expect(response.body).to.equal(ino);

        return chakram.wait();
      });
  });

  it('should allow to confirm a changed email address', function () {
    let token;
    const mail = findMailAndParseBody(mails, 'new-email@email.www', 'openSenseMap E-Mail address confirmation');
    expect(mail).to.not.be.undefined;
    const links = mail('a');
    links.each(function (_, link) {
      const href = $(link).attr('href');
      if (href.includes('token=')) {
        token = href.split('=')[1].split('&')[0];
      }
    });
    expect(token).to.exist;

    return chakram.post(`${BASE_URL}/users/confirm-email`, { token, email: 'new-email@email.www' })
      .then(function (response) {
        expect(response).to.have.status(200);
        expect(response).to.have.json({ code: 'Ok', message: 'E-Mail successfully confirmed. Thank you' });

        return chakram.wait();
      });
  });
});