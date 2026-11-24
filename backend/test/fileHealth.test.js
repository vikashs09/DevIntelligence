import test from 'node:test';import assert from 'node:assert/strict';
import {analyzeFileMetadata,summarizeFileHealth} from '../src/services/fileHealthService.js';
test('large file receives a real size-based flag and no imaginary coverage',()=>{const f=analyzeFileMetadata({path:'src/mega.js',size:200000,sha:'abc'});assert.equal(f.bytes,200000);assert.ok(f.flags.includes('very-large-file'));assert.equal(f.assessment.testCoverage,'unknown');assert.equal(f.assessment.complexity,'unknown')});
test('normal source is not mistakenly classified as a test file',()=>{const f=analyzeFileMetadata({path:'src/module.ts',size:1000});assert.equal(f.isTest,false);assert.equal(f.healthScore,100)});
test('test file recognized and aggregation reports counts',()=>{const f=analyzeFileMetadata({path:'test/user.spec.js',size:500});assert.equal(f.isTest,true);assert.deepEqual(summarizeFileHealth([f]).totalFiles,1)});
