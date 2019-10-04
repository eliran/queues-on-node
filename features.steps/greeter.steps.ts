import { expect } from 'chai';
import { Given, Then, When } from 'cucumber';
import { hello } from '@app/index';

Given('hello function', function() {
  this.fn = hello;
});

When('I invoke it', function() {
  this.fn_result = this.fn();
});

Then('I should get back {string}', function(s) {
  expect(this.fn_result).to.equal(s);
});
