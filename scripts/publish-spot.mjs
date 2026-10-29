#!/usr/bin/env node

import { runPublisher } from './publish-package.mjs'

await runPublisher(['spot-ui', 'spot-react'])
