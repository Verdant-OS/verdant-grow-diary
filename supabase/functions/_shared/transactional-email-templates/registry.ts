/// <reference types="npm:@types/react@18.3.1" />
import type { ComponentType } from 'npm:react@18.3.1'

import { template as orderConfirmation } from './order-confirmation.tsx'
import { template as welcome } from './welcome.tsx'
import { template as actionRequired } from './action-required.tsx'
import { template as growUpdate } from './grow-update.tsx'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, unknown>) => string)
  displayName?: string
  previewData?: Record<string, unknown>
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'order-confirmation': orderConfirmation,
  welcome,
  'action-required': actionRequired,
  'grow-update': growUpdate,
}
