import { expect } from 'chai';
import { Given, Then, When } from 'cucumber';

Given('I have a job', function() {
  return 'pending';
});

When('I schedule it on a queue', function () {
  return 'pending';
});

Then('the job should not execute by a worker', function() {
  return 'pending';
});

Then('the job should execute by a worker', function() {
  return 'pending';
});


Then('the job should be scheduled', function() {
  return 'pending';
});

Then('the job should not be scheduled', function () {
  return 'pending';
});

When('{int} hour elapsed', function (hours) {
  return 'pending';
});

When('I schedule it on a queue in {int} hour', function (hours) {
  return 'pending';
});

When('{int} minutes elapsed', function (minutes) {
  return 'pending';
});

When('I cancel the job', function () {
  return 'pending';
});

