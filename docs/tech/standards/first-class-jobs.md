# First Class Jobs Pattern

When working with job queue systems like Bull, a common pattern for managing and displaying job status involves using a separate database to store job information. This approach ensures that the application can easily show users the current state of their jobs without directly querying the job queue system.

## Pattern Overview

1. **Job Creation**  
 When a job is created, a corresponding record is inserted into the database. At the same time, the job is scheduled on the Bull queue.
2. **Job Processing Start**  
 When the Bull queue picks up the job for processing, it updates the job's status in the database to reflect that it has started.
3. **Progress Updates**  
 As the job progresses, the status and optionally a progress value are continuously updated in the database.
4. **Job Completion**  
 Eventually, the job either succeeds, fails, or retries. This final state is recorded in the database.
5. **User Interface**  
 The application reads job status and progress exclusively from the database, avoiding direct queries to the job queue system (e.g., Redis).

This pattern decouples the job state management from the job queue system, providing a reliable and centralized way to track and display job statuses to users.