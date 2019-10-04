Feature: Schedule Job API
  Background:
    Given I have a job

  Scenario: Schedule a job immediately
    When I schedule it on a queue
    Then the job should execute by a worker
    And the job should not be scheduled

  Scenario: Schedule a job in the future
    When I schedule it on a queue in 1 hour
    And 1 hour elapsed
    Then the job should execute by a worker
    And the job should not be scheduled

  Scenario: Schedule a job in the future but time not passed yet
    When I schedule it on a queue in 1 hour
    And 59 minutes elapsed
    Then the job should be scheduled
    And the job should not execute by a worker

  Scenario: Cancel a scheduled job
    When I schedule it on a queue in 1 hour
    And I cancel the job
    And 1 hour elapsed
    Then the job should not be scheduled
    And the job should not execute by a worker
     
