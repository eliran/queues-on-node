Feature: Greeter

  Scenario: Returns greeting
    Given hello function
    When I invoke it
    Then I should get back 'Hello World'
