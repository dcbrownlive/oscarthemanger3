var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
import { getUrl } from '../utils/http-helpers.js';

var MONGO_LISTENING = {
  stdout: ' [initandlisten] waiting for connections on port',
};

function startRun(sandbox) {
  var run = sandbox.run();
  run.match('myapp');
  run.match('proxy');
  run.tellMongo(MONGO_LISTENING);
  run.waitSecs(20);
  run.match('MongoDB');
  return run;
}

selftest.define('modules - test app', function() {
  const s = new Sandbox();

  // Make sure we use the right "env" section of .babelrc.
  s.set('NODE_ENV', 'development');

  // For meteortesting:mocha to work we must set test browser driver
  // See https://github.com/meteortesting/meteor-mocha
  s.set('TEST_BROWSER_DRIVER', 'puppeteer');

  s.createApp('modules-test-app', 'modules');
  s.cd('modules-test-app', function() {
    const run = s.run(
      'test',
      '--once',
      '--full-app',
      '--driver-package',
      'meteortesting:mocha'
    );

    run.waitSecs(60);
    run.match('App running at');
    run.match('SERVER FAILURES: 0');
    run.match('CLIENT FAILURES: 0');
    run.expectExit(0);
  });
});

selftest.define('modules - unimported lazy files', function() {
  const s = new Sandbox();
  s.createApp('myapp', 'app-with-unimported-lazy-file');
  s.cd('myapp', function() {
    const run = s.run('--once');
    run.waitSecs(30);
    run.expectExit(1);
    run.forbid("This file shouldn't be loaded");
  });
});

// Checks that `import X from 'meteor/package'` will import (and re-export) the
// mainModule if one exists, otherwise will simply export Package['package'].
// Overlaps with compiler-plugin.js's "install-packages.js" code.
selftest.define('modules - import chain for packages', () => {
  const s = new Sandbox({ fakeMongo: true });

  s.createApp('myapp', 'package-tests');
  s.cd('myapp');

  s.write(
    '.meteor/packages',
    ['meteor-base', 'modules', 'with-add-files', 'with-main-module', ''].join(
      '\n'
    )
  );

  s.write(
    'main.js',
    [
      "var packageNameA = require('meteor/with-add-files').name;",
      "var packageNameB = require('meteor/with-main-module').name;",
      '',
      "console.log('with-add-files: ' + packageNameA);",
      "console.log('with-main-module: ' + packageNameB);",
      '',
    ].join('\n')
  );

  const run = startRun(s);

  run.waitSecs(30);

  // On the server, we just check that importing *works*, not *how* it works
  run.match('with-add-files: with-add-files');
  run.match('with-main-module: with-main-module');

  // On the client, we just check that install() is called correctly
  checkModernAndLegacyUrls('/packages/modules.js', body => {
    selftest.expectTrue(body.includes('\ninstall("with-add-files");'));
    selftest.expectTrue(
      body.includes(
        '\ninstall("with-main-module", ' +
          '"meteor/with-main-module/with-main-module.js");'
      )
    );
  });

  run.stop();
});

function checkModernAndLegacyUrls(path, test) {
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  test(getUrl('http://localhost:3000' + path));
  test(getUrl('http://localhost:3000/__browser.legacy' + path));
}
