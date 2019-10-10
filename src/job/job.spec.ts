import { expect } from 'chai';
import {JobAlreadyRegisteredError, JobFactory, JobRegistry} from '.';

describe('Job Registry', () => {
    let sut!: JobRegistry;

    beforeEach(() => {
       sut = new JobRegistry();
    });

    it('should initialize with no jobs', () => {
        expect(sut.allRegisteredJobFactories).to.be.empty;
    });

    it('should allow creating new job factories', () => {
        const factory = sut.make('my-jobs', async (context: {}) => {});
        expect(factory).to.be.an.instanceOf(JobFactory);
    });

    it('should return a list of job factories registered', () => {
        sut.make('job1', async (context: {}) => {});
        sut.make('job2', async (context: {}) => {});

        expect(sut.allRegisteredJobFactories).to.have.members(['job1', 'job2']);
    });

    it ('should throw if trying to register a factory with the same name', () => {
        sut.make('job1', async (context: {}) => {});

        expect(() => sut.make('job1', async (context: {}) => {})).to.throw(JobAlreadyRegisteredError);
        expect(sut.allRegisteredJobFactories).to.have.members(['job1']);
    });

    it('should create factories with the correct name', () => {
        const factory = sut.make('a-name-for-jobs', async (context: {}) => {});
        expect(factory.name).to.equal('a-name-for-jobs');
    });
});

describe('Job factory', () => {
    let registry!: JobRegistry;
    let sut!: JobFactory<any>;

    beforeEach(() => {
        registry = new JobRegistry();
        sut = registry.make('a-job', async (context: {}) => {});
    });

    it('should create jobs with assigned name', () => {
        const job = sut.make({});
        expect(job.name).to.equal(sut.name);
    });

    it('should create jobs with unique ids', () => {
        const job1 = sut.make({});
        const job2 = sut.make({});

        expect(job1.id).to.not.equal(job2.id);
    });
});
