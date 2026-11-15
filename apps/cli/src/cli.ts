#!/usr/bin/env node
import { dispatch } from './router.js';

process.exitCode = await dispatch(process.argv.slice(2));
