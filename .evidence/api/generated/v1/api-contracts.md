# HTTP 资源与交互契约

> 合成样例与静态消费流程检查，不是运行时授权或端到端验收。

## GET /subscriptions/{subscriptionId}/accesses/{accessId}

- 能力：`capability.read-access-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-access-publisher, binding.parent-access`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-access-publisher",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}/accesses/{accessId}

- 能力：`capability.read-access-reader`；角色：`role.reader`
- 实例约束：`binding.caller-access-reader, binding.parent-access`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-access-reader",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}/accesses/{accessId}/result

- 能力：`capability.read-access-result-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-access-result-publisher, binding.parent-access-result`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-access-result-publisher",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}/accesses/{accessId}/result

- 能力：`capability.read-access-result-reader`；角色：`role.reader`
- 实例约束：`binding.caller-access-result-reader, binding.parent-access-result`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-access-result-reader",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /prepaid-accounts/{accountId}

- 能力：`capability.read-account-account-provider`；角色：`role.account-provider`
- 实例约束：`binding.caller-account-account-provider`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-account-account-provider",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /prepaid-accounts/{accountId}

- 能力：`capability.read-account-account-user`；角色：`role.account-user`
- 实例约束：`binding.caller-account-account-user`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-account-account-user",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /chapters/{chapterId}

- 能力：`capability.read-chapter-reader`；角色：`role.reader`
- 实例约束：`binding.caller-chapter-reader`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-chapter-reader",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /columns/{columnId}

- 能力：`capability.read-column-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-column-publisher`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-column-publisher",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /columns/{columnId}

- 能力：`capability.read-column-reader`；角色：`role.reader`
- 实例约束：`binding.caller-column-reader`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-column-reader",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /prepaid-accounts/{accountId}/debits/{debitId}

- 能力：`capability.read-debit-account-provider`；角色：`role.account-provider`
- 实例约束：`binding.caller-debit-account-provider, binding.parent-debit`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-debit-account-provider",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /prepaid-accounts/{accountId}/debits/{debitId}

- 能力：`capability.read-debit-account-user`；角色：`role.account-user`
- 实例约束：`binding.caller-debit-account-user, binding.parent-debit`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-debit-account-user",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /prepaid-accounts/{accountId}/debits/{debitId}/result

- 能力：`capability.read-debit-result-account-provider`；角色：`role.account-provider`
- 实例约束：`binding.caller-debit-result-account-provider, binding.parent-debit-result`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-debit-result-account-provider",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /prepaid-accounts/{accountId}/debits/{debitId}/result

- 能力：`capability.read-debit-result-account-user`；角色：`role.account-user`
- 实例约束：`binding.caller-debit-result-account-user, binding.parent-debit-result`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-debit-result-account-user",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /discontinuations/{discontinuationId}

- 能力：`capability.read-discontinuation-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-discontinuation-publisher`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-discontinuation-publisher",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /discontinuations/{discontinuationId}

- 能力：`capability.read-discontinuation-reader`；角色：`role.reader`
- 实例约束：`binding.caller-discontinuation-reader`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-discontinuation-reader",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}/payment

- 能力：`capability.read-payment-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-payment-publisher, binding.parent-payment`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-payment-publisher",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}/payment

- 能力：`capability.read-payment-reader`；角色：`role.reader`
- 实例约束：`binding.caller-payment-reader, binding.parent-payment`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-payment-reader",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}/refund

- 能力：`capability.read-refund-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-refund-publisher, binding.parent-refund`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-refund-publisher",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}/refund

- 能力：`capability.read-refund-reader`；角色：`role.reader`
- 实例约束：`binding.caller-refund-reader, binding.parent-refund`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-refund-reader",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}/refund/result

- 能力：`capability.read-refund-result-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-refund-result-publisher, binding.parent-refund-result`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-refund-result-publisher",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}/refund/result

- 能力：`capability.read-refund-result-reader`；角色：`role.reader`
- 实例约束：`binding.caller-refund-result-reader, binding.parent-refund-result`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-refund-result-reader",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /relaunches/{relaunchId}

- 能力：`capability.read-relaunch-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-relaunch-publisher`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-relaunch-publisher",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /relaunches/{relaunchId}

- 能力：`capability.read-relaunch-reader`；角色：`role.reader`
- 实例约束：`binding.caller-relaunch-reader`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-relaunch-reader",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}/restoration

- 能力：`capability.read-restore-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-restore-publisher, binding.parent-restore`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-restore-publisher",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}/restoration

- 能力：`capability.read-restore-reader`；角色：`role.reader`
- 实例约束：`binding.caller-restore-reader, binding.parent-restore`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-restore-reader",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}/restoration/result

- 能力：`capability.read-restore-result-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-restore-result-publisher, binding.parent-restore-result`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-restore-result-publisher",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}/restoration/result

- 能力：`capability.read-restore-result-reader`；角色：`role.reader`
- 实例约束：`binding.caller-restore-result-reader, binding.parent-restore-result`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-restore-result-reader",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}

- 能力：`capability.read-subscription-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-subscription-publisher`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-subscription-publisher",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## GET /subscriptions/{subscriptionId}

- 能力：`capability.read-subscription-reader`；角色：`role.reader`
- 实例约束：`binding.caller-subscription-reader`
- 幂等：`not_applicable`；并发：`none`

### 请求

```json
{
  "example": {},
  "fields": [],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "返回本实例当前可读取的业务表示。",
    "headers": {
      "Cache-Control": "no-store"
    },
    "representationRef": "representation.read-subscription-reader",
    "status": 200
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "指定实例或其履约结果尚未形成。",
    "headers": {},
    "status": 404
  }
]
```

## POST /subscriptions/{subscriptionId}/accesses

- 能力：`capability.register-access-reader`；角色：`role.reader`
- 实例约束：`binding.caller-access-reader, binding.parent-access`
- 幂等：`key`；并发：`none`

### 请求

```json
{
  "example": {
    "chapter_id": "CH-01",
    "column_id": "COL-BM",
    "edition_id": "ED-1",
    "evidenceRefs": [
      "instance.subscription",
      "instance.mobile-result"
    ],
    "reader_id": "READER-001",
    "request_id": "ACCESS-MOBILE",
    "started_at": "2026-10-01T09:06:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.access#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#chapter_id",
      "name": "chapter_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "记录已形成的付费内容访问请求；履约完成另按规则判断。",
    "headers": {
      "Cache-Control": "no-store",
      "Location": "/subscriptions/SUB-20261001-001/accesses/ACCESS-MOBILE"
    },
    "representationRef": "representation.register-access-reader",
    "status": 201
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "同一幂等键对应不同输入，或同一请求已经有有效结果。",
    "headers": {},
    "status": 409
  },
  {
    "description": "业务字段、证据实际玩家、时间、金额或实例归属不满足规则。",
    "headers": {},
    "status": 422
  }
]
```

## POST /subscriptions/{subscriptionId}/accesses/{accessId}/result

- 能力：`capability.register-access-result-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-access-result-publisher, binding.parent-access-result`
- 幂等：`key`；并发：`none`

### 请求

```json
{
  "example": {
    "chapter_id": "CH-01",
    "column_id": "COL-BM",
    "confirmed_at": "2026-10-01T09:06:02Z",
    "delivered": true,
    "edition_id": "ED-1",
    "evidenceRefs": [
      "instance.access-mobile"
    ],
    "reader_id": "READER-001",
    "request_id": "ACCESS-MOBILE",
    "subscription_id": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.access#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#chapter_id",
      "name": "chapter_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#delivered",
      "name": "delivered",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "记录已形成的内容提供凭证；履约完成另按规则判断。",
    "headers": {
      "Cache-Control": "no-store",
      "Location": "/subscriptions/SUB-20261001-001/accesses/ACCESS-MOBILE/result"
    },
    "representationRef": "representation.register-access-result-publisher",
    "status": 201
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "同一幂等键对应不同输入，或同一请求已经有有效结果。",
    "headers": {},
    "status": 409
  },
  {
    "description": "业务字段、证据实际玩家、时间、金额或实例归属不满足规则。",
    "headers": {},
    "status": 422
  }
]
```

## POST /prepaid-accounts

- 能力：`capability.register-account-account-user`；角色：`role.account-user`
- 实例约束：`binding.caller-account-account-user`
- 幂等：`key`；并发：`none`

### 请求

```json
{
  "example": {
    "agreement_id": "PREPAID-001",
    "reader_id": "READER-001",
    "signed_at": "2026-10-01T08:00:00Z"
  },
  "fields": [
    {
      "fmAttributeRef": "contract.prepaid#agreement_id",
      "name": "agreement_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.prepaid#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.prepaid#signed_at",
      "name": "signed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    }
  ],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "记录已形成的预付费账户协议；履约完成另按规则判断。",
    "headers": {
      "Cache-Control": "no-store",
      "Location": "/prepaid-accounts/PREPAID-001"
    },
    "representationRef": "representation.register-account-account-user",
    "status": 201
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "同一幂等键对应不同输入，或同一请求已经有有效结果。",
    "headers": {},
    "status": 409
  },
  {
    "description": "业务字段、证据实际玩家、时间、金额或实例归属不满足规则。",
    "headers": {},
    "status": 422
  }
]
```

## POST /prepaid-accounts/{accountId}/debits

- 能力：`capability.register-debit-account-user`；角色：`role.account-user`
- 实例约束：`binding.caller-debit-account-user, binding.parent-debit`
- 幂等：`key`；并发：`none`

### 请求

```json
{
  "example": {
    "agreement_id": "PREPAID-001",
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.prepaid-agreement",
      "instance.payment"
    ],
    "expired_at": "2026-10-01T09:15:00Z",
    "payment_request_id": "PAY-001",
    "reader_id": "READER-001",
    "request_id": "PREPAID-REQ-001",
    "started_at": "2026-10-01T09:02:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.prepaid#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#expired_at",
      "name": "expired_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#payment_request_id",
      "name": "payment_request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#agreement_id",
      "name": "agreement_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "记录已形成的账户余额抵扣请求；履约完成另按规则判断。",
    "headers": {
      "Cache-Control": "no-store",
      "Location": "/prepaid-accounts/PREPAID-001/debits/PREPAID-REQ-001"
    },
    "representationRef": "representation.register-debit-account-user",
    "status": 201
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "同一幂等键对应不同输入，或同一请求已经有有效结果。",
    "headers": {},
    "status": 409
  },
  {
    "description": "业务字段、证据实际玩家、时间、金额或实例归属不满足规则。",
    "headers": {},
    "status": 422
  }
]
```

## POST /prepaid-accounts/{accountId}/debits/{debitId}/result

- 能力：`capability.register-debit-result-account-provider`；角色：`role.account-provider`
- 实例约束：`binding.caller-debit-result-account-provider, binding.parent-debit-result`
- 幂等：`key`；并发：`none`

### 请求

```json
{
  "example": {
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "confirmed_at": "2026-10-01T09:05:00Z",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.prepaid-request",
      "instance.payment"
    ],
    "payment_id": "PREPAID-TX-001",
    "payment_request_id": "PAY-001",
    "reader_id": "READER-001",
    "request_id": "PREPAID-REQ-001",
    "subscription_id": "SUB-20261001-001",
    "success": true
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.prepaid#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#payment_request_id",
      "name": "payment_request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#payment_id",
      "name": "payment_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#success",
      "name": "success",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "记录已形成的预付费抵扣凭证；履约完成另按规则判断。",
    "headers": {
      "Cache-Control": "no-store",
      "Location": "/prepaid-accounts/PREPAID-001/debits/PREPAID-REQ-001/result"
    },
    "representationRef": "representation.register-debit-result-account-provider",
    "status": 201
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "同一幂等键对应不同输入，或同一请求已经有有效结果。",
    "headers": {},
    "status": 409
  },
  {
    "description": "业务字段、证据实际玩家、时间、金额或实例归属不满足规则。",
    "headers": {},
    "status": 422
  }
]
```

## POST /discontinuations

- 能力：`capability.register-discontinuation-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-discontinuation-publisher`
- 幂等：`key`；并发：`none`

### 请求

```json
{
  "example": {
    "column_id": "COL-BM",
    "created_at": "2026-10-16T10:00:00Z",
    "delisted": true,
    "evidenceRefs": [
      "instance.subscription"
    ],
    "missed_due_at": "2026-10-08T10:00:00Z",
    "missing_content": true,
    "reader_id": "READER-001",
    "rescheduled": false,
    "subscription_id": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "evidence.discontinuation#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#created_at",
      "name": "created_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#missed_due_at",
      "name": "missed_due_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#missing_content",
      "name": "missing_content",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#rescheduled",
      "name": "rescheduled",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#delisted",
      "name": "delisted",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "记录已形成的断更下架记录；履约完成另按规则判断。",
    "headers": {
      "Cache-Control": "no-store",
      "Location": "/discontinuations/DISCONTINUATION-001"
    },
    "representationRef": "representation.register-discontinuation-publisher",
    "status": 201
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "同一幂等键对应不同输入，或同一请求已经有有效结果。",
    "headers": {},
    "status": 409
  },
  {
    "description": "业务字段、证据实际玩家、时间、金额或实例归属不满足规则。",
    "headers": {},
    "status": 422
  }
]
```

## POST /subscriptions/{subscriptionId}/payment

- 能力：`capability.register-payment-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-payment-publisher, binding.parent-payment`
- 幂等：`key`；并发：`none`

### 请求

```json
{
  "example": {
    "column_id": "COL-BM",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.subscription"
    ],
    "reader_id": "READER-001",
    "request_id": "PAY-001",
    "subscription_id": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.payment#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "记录已形成的订阅费支付请求；履约完成另按规则判断。",
    "headers": {
      "Cache-Control": "no-store",
      "Location": "/subscriptions/SUB-20261001-001/payment"
    },
    "representationRef": "representation.register-payment-publisher",
    "status": 201
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "同一幂等键对应不同输入，或同一请求已经有有效结果。",
    "headers": {},
    "status": 409
  },
  {
    "description": "业务字段、证据实际玩家、时间、金额或实例归属不满足规则。",
    "headers": {},
    "status": 422
  }
]
```

## POST /subscriptions/{subscriptionId}/refund

- 能力：`capability.register-refund-reader`；角色：`role.reader`
- 实例约束：`binding.caller-refund-reader, binding.parent-refund`
- 幂等：`key`；并发：`none`

### 请求

```json
{
  "example": {
    "column_id": "COL-BM",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.subscription",
      "instance.discontinuation",
      "instance.mobile-result"
    ],
    "reader_id": "READER-001",
    "request_id": "REFUND-001",
    "started_at": "2026-10-16T10:01:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.refund#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "记录已形成的断更退款请求；履约完成另按规则判断。",
    "headers": {
      "Cache-Control": "no-store",
      "Location": "/subscriptions/SUB-20261001-001/refund"
    },
    "representationRef": "representation.register-refund-reader",
    "status": 201
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "同一幂等键对应不同输入，或同一请求已经有有效结果。",
    "headers": {},
    "status": 409
  },
  {
    "description": "业务字段、证据实际玩家、时间、金额或实例归属不满足规则。",
    "headers": {},
    "status": 422
  }
]
```

## POST /subscriptions/{subscriptionId}/refund/result

- 能力：`capability.register-refund-result-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-refund-result-publisher, binding.parent-refund-result`
- 幂等：`key`；并发：`none`

### 请求

```json
{
  "example": {
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "confirmed_at": "2026-10-18T10:00:00Z",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.refund"
    ],
    "reader_id": "READER-001",
    "receipt_id": "REFUND-RECEIPT-001",
    "request_id": "REFUND-001",
    "settled": true,
    "subscription_id": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.refund#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#receipt_id",
      "name": "receipt_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#settled",
      "name": "settled",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "记录已形成的退款到账凭证；履约完成另按规则判断。",
    "headers": {
      "Cache-Control": "no-store",
      "Location": "/subscriptions/SUB-20261001-001/refund/result"
    },
    "representationRef": "representation.register-refund-result-publisher",
    "status": 201
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "同一幂等键对应不同输入，或同一请求已经有有效结果。",
    "headers": {},
    "status": 409
  },
  {
    "description": "业务字段、证据实际玩家、时间、金额或实例归属不满足规则。",
    "headers": {},
    "status": 422
  }
]
```

## POST /relaunches

- 能力：`capability.register-relaunch-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-relaunch-publisher`
- 幂等：`key`；并发：`none`

### 请求

```json
{
  "example": {
    "column_id": "COL-BM",
    "created_at": "2026-11-01T12:00:00Z",
    "edition_id": "ED-2",
    "evidenceRefs": [
      "instance.subscription"
    ],
    "listed": true,
    "reader_id": "READER-001",
    "relaunched_at": "2026-11-01T11:59:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "evidence.relaunch#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#created_at",
      "name": "created_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#relaunched_at",
      "name": "relaunched_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#listed",
      "name": "listed",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "记录已形成的重新上架记录；履约完成另按规则判断。",
    "headers": {
      "Cache-Control": "no-store",
      "Location": "/relaunches/RELAUNCH-001"
    },
    "representationRef": "representation.register-relaunch-publisher",
    "status": 201
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "同一幂等键对应不同输入，或同一请求已经有有效结果。",
    "headers": {},
    "status": 409
  },
  {
    "description": "业务字段、证据实际玩家、时间、金额或实例归属不满足规则。",
    "headers": {},
    "status": 422
  }
]
```

## POST /subscriptions/{subscriptionId}/restoration

- 能力：`capability.register-restore-reader`；角色：`role.reader`
- 实例约束：`binding.caller-restore-reader, binding.parent-restore`
- 幂等：`key`；并发：`none`

### 请求

```json
{
  "example": {
    "column_id": "COL-BM",
    "edition_id": "ED-2",
    "evidenceRefs": [
      "instance.subscription",
      "instance.relaunch",
      "instance.refunded"
    ],
    "reader_id": "READER-001",
    "request_id": "RESTORE-001",
    "started_at": "2026-11-01T12:01:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.restore#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "记录已形成的免费恢复请求；履约完成另按规则判断。",
    "headers": {
      "Cache-Control": "no-store",
      "Location": "/subscriptions/SUB-20261001-001/restoration"
    },
    "representationRef": "representation.register-restore-reader",
    "status": 201
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "同一幂等键对应不同输入，或同一请求已经有有效结果。",
    "headers": {},
    "status": 409
  },
  {
    "description": "业务字段、证据实际玩家、时间、金额或实例归属不满足规则。",
    "headers": {},
    "status": 422
  }
]
```

## POST /subscriptions/{subscriptionId}/restoration/result

- 能力：`capability.register-restore-result-publisher`；角色：`role.publisher`
- 实例约束：`binding.caller-restore-result-publisher, binding.parent-restore-result`
- 幂等：`key`；并发：`none`

### 请求

```json
{
  "example": {
    "charged_minor_units": 0,
    "column_id": "COL-BM",
    "confirmed_at": "2026-11-01T12:02:00Z",
    "edition_id": "ED-2",
    "evidenceRefs": [
      "instance.restore"
    ],
    "reader_id": "READER-001",
    "request_id": "RESTORE-001",
    "restored": true,
    "subscription_id": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.restore#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#charged_minor_units",
      "name": "charged_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#restored",
      "name": "restored",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "记录已形成的免费恢复凭证；履约完成另按规则判断。",
    "headers": {
      "Cache-Control": "no-store",
      "Location": "/subscriptions/SUB-20261001-001/restoration/result"
    },
    "representationRef": "representation.register-restore-result-publisher",
    "status": 201
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "同一幂等键对应不同输入，或同一请求已经有有效结果。",
    "headers": {},
    "status": 409
  },
  {
    "description": "业务字段、证据实际玩家、时间、金额或实例归属不满足规则。",
    "headers": {},
    "status": 422
  }
]
```

## POST /subscriptions

- 能力：`capability.register-subscription-reader`；角色：`role.reader`
- 实例约束：`binding.caller-subscription-reader`
- 幂等：`key`；并发：`none`

### 请求

```json
{
  "example": {
    "access_seconds": 60,
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "currency": "CNY",
    "edition_id": "ED-1",
    "payment_seconds": 900,
    "reader_id": "READER-001",
    "refund_seconds": 604800,
    "restore_seconds": 86400,
    "signed_at": "2026-10-01T09:00:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "contract.subscription#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#signed_at",
      "name": "signed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#payment_seconds",
      "name": "payment_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#access_seconds",
      "name": "access_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#refund_seconds",
      "name": "refund_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#restore_seconds",
      "name": "restore_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    }
  ],
  "mediaType": "application/json"
}
```

### 响应

```json
[
  {
    "description": "记录已形成的专栏订阅合同；履约完成另按规则判断。",
    "headers": {
      "Cache-Control": "no-store",
      "Location": "/subscriptions/SUB-20261001-001"
    },
    "representationRef": "representation.register-subscription-reader",
    "status": 201
  },
  {
    "description": "非本实例参与方、无代理资格或不具备指定章节访问资格。",
    "headers": {},
    "status": 403
  },
  {
    "description": "同一幂等键对应不同输入，或同一请求已经有有效结果。",
    "headers": {},
    "status": 409
  },
  {
    "description": "业务字段、证据实际玩家、时间、金额或实例归属不满足规则。",
    "headers": {},
    "status": 422
  }
]
```

## 表示与超媒体

### representation.read-access-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "result": {
        "href": "/subscriptions/SUB-20261001-001/accesses/ACCESS-MOBILE/result"
      },
      "self": {
        "href": "/subscriptions/SUB-20261001-001/accesses/ACCESS-MOBILE"
      }
    },
    "chapter_id": "CH-01",
    "column_id": "COL-BM",
    "edition_id": "ED-1",
    "evidenceRefs": [
      "instance.subscription",
      "instance.mobile-result"
    ],
    "expired_at": "2026-10-01T09:07:00Z",
    "fulfillmentStatus": "completed",
    "reader_id": "READER-001",
    "request_id": "ACCESS-MOBILE",
    "started_at": "2026-10-01T09:06:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "accessId": "ACCESS-MOBILE",
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.access#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#expired_at",
      "name": "expired_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#chapter_id",
      "name": "chapter_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.read-access-publisher",
  "links": [
    {
      "capabilityRef": "capability.read-access-result-publisher",
      "kind": "navigation",
      "parameterBindings": {
        "accessId": {
          "kind": "path",
          "name": "accessId"
        },
        "subscriptionId": {
          "kind": "path",
          "name": "subscriptionId"
        }
      },
      "rel": "result"
    }
  ],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.access",
  "uri": "/subscriptions/{subscriptionId}/accesses/{accessId}",
  "view": "item"
}
```

### representation.read-access-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "result": {
        "href": "/subscriptions/SUB-20261001-001/accesses/ACCESS-MOBILE/result"
      },
      "self": {
        "href": "/subscriptions/SUB-20261001-001/accesses/ACCESS-MOBILE"
      }
    },
    "chapter_id": "CH-01",
    "column_id": "COL-BM",
    "edition_id": "ED-1",
    "evidenceRefs": [
      "instance.subscription",
      "instance.mobile-result"
    ],
    "expired_at": "2026-10-01T09:07:00Z",
    "fulfillmentStatus": "completed",
    "reader_id": "READER-001",
    "request_id": "ACCESS-MOBILE",
    "started_at": "2026-10-01T09:06:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "accessId": "ACCESS-MOBILE",
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.access#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#expired_at",
      "name": "expired_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#chapter_id",
      "name": "chapter_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.read-access-reader",
  "links": [
    {
      "capabilityRef": "capability.read-access-result-reader",
      "kind": "navigation",
      "parameterBindings": {
        "accessId": {
          "kind": "path",
          "name": "accessId"
        },
        "subscriptionId": {
          "kind": "path",
          "name": "subscriptionId"
        }
      },
      "rel": "result"
    }
  ],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.access",
  "uri": "/subscriptions/{subscriptionId}/accesses/{accessId}",
  "view": "item"
}
```

### representation.read-access-result-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/subscriptions/SUB-20261001-001/accesses/ACCESS-MOBILE/result"
      }
    },
    "chapter_id": "CH-01",
    "column_id": "COL-BM",
    "confirmed_at": "2026-10-01T09:06:02Z",
    "delivered": true,
    "edition_id": "ED-1",
    "evidenceRefs": [
      "instance.access-mobile"
    ],
    "reader_id": "READER-001",
    "request_id": "ACCESS-MOBILE",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "accessId": "ACCESS-MOBILE",
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.access#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#chapter_id",
      "name": "chapter_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#delivered",
      "name": "delivered",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.read-access-result-publisher",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.access-result",
  "uri": "/subscriptions/{subscriptionId}/accesses/{accessId}/result",
  "view": "singleton"
}
```

### representation.read-access-result-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "content": {
        "href": "/chapters/CH-01"
      },
      "self": {
        "href": "/subscriptions/SUB-20261001-001/accesses/ACCESS-MOBILE/result"
      }
    },
    "chapter_id": "CH-01",
    "column_id": "COL-BM",
    "confirmed_at": "2026-10-01T09:06:02Z",
    "delivered": true,
    "edition_id": "ED-1",
    "evidenceRefs": [
      "instance.access-mobile"
    ],
    "reader_id": "READER-001",
    "request_id": "ACCESS-MOBILE",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "accessId": "ACCESS-MOBILE",
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.access#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#chapter_id",
      "name": "chapter_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#delivered",
      "name": "delivered",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.read-access-result-reader",
  "links": [
    {
      "capabilityRef": "capability.read-chapter-reader",
      "kind": "navigation",
      "parameterBindings": {
        "chapterId": {
          "kind": "field",
          "name": "chapter_id"
        }
      },
      "rel": "content"
    }
  ],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.access-result",
  "uri": "/subscriptions/{subscriptionId}/accesses/{accessId}/result",
  "view": "singleton"
}
```

### representation.read-account-account-provider

```json
{
  "actorRoleRefs": [
    "role.account-provider"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/prepaid-accounts/PREPAID-001"
      }
    },
    "agreement_id": "PREPAID-001",
    "reader_id": "READER-001",
    "signed_at": "2026-10-01T08:00:00Z"
  },
  "exampleParameters": {
    "accountId": "PREPAID-001"
  },
  "fields": [
    {
      "fmAttributeRef": "contract.prepaid#agreement_id",
      "name": "agreement_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.prepaid#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.prepaid#signed_at",
      "name": "signed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    }
  ],
  "id": "representation.read-account-account-provider",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.account",
  "uri": "/prepaid-accounts/{accountId}",
  "view": "item"
}
```

### representation.read-account-account-user

```json
{
  "actorRoleRefs": [
    "role.account-user"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/prepaid-accounts/PREPAID-001"
      }
    },
    "agreement_id": "PREPAID-001",
    "reader_id": "READER-001",
    "signed_at": "2026-10-01T08:00:00Z"
  },
  "exampleParameters": {
    "accountId": "PREPAID-001"
  },
  "fields": [
    {
      "fmAttributeRef": "contract.prepaid#agreement_id",
      "name": "agreement_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.prepaid#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.prepaid#signed_at",
      "name": "signed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    }
  ],
  "id": "representation.read-account-account-user",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.account",
  "uri": "/prepaid-accounts/{accountId}",
  "view": "item"
}
```

### representation.read-chapter-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/chapters/CH-01"
      }
    },
    "body": "一项履约始于权利方的请求，完成由实际结果凭证证明。",
    "chapter_id": "CH-01",
    "column_id": "COL-BM",
    "edition_id": "ED-1",
    "title": "从请求与证明理解业务"
  },
  "exampleParameters": {
    "chapterId": "CH-01"
  },
  "fields": [
    {
      "fmAttributeRef": "thing.chapter#chapter_id",
      "name": "chapter_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "thing.chapter#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "thing.chapter#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "thing.chapter#title",
      "name": "title",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "thing.chapter#body",
      "name": "body",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    }
  ],
  "id": "representation.read-chapter-reader",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.chapter",
  "uri": "/chapters/{chapterId}",
  "view": "item"
}
```

### representation.read-column-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/columns/COL-BM"
      }
    },
    "column_id": "COL-BM",
    "currency": "CNY",
    "edition_id": "ED-1",
    "price_minor_units": 9900,
    "title": "业务建模实战"
  },
  "exampleParameters": {
    "columnId": "COL-BM"
  },
  "fields": [
    {
      "fmAttributeRef": "thing.column#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "thing.column#title",
      "name": "title",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "thing.column#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "thing.column#price_minor_units",
      "name": "price_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "thing.column#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    }
  ],
  "id": "representation.read-column-publisher",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.column",
  "uri": "/columns/{columnId}",
  "view": "item"
}
```

### representation.read-column-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/columns/COL-BM"
      }
    },
    "column_id": "COL-BM",
    "currency": "CNY",
    "edition_id": "ED-1",
    "price_minor_units": 9900,
    "title": "业务建模实战"
  },
  "exampleParameters": {
    "columnId": "COL-BM"
  },
  "fields": [
    {
      "fmAttributeRef": "thing.column#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "thing.column#title",
      "name": "title",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "thing.column#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "thing.column#price_minor_units",
      "name": "price_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "thing.column#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    }
  ],
  "id": "representation.read-column-reader",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.column",
  "uri": "/columns/{columnId}",
  "view": "item"
}
```

### representation.read-debit-account-provider

```json
{
  "actorRoleRefs": [
    "role.account-provider"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "result": {
        "href": "/prepaid-accounts/PREPAID-001/debits/PREPAID-REQ-001/result"
      },
      "self": {
        "href": "/prepaid-accounts/PREPAID-001/debits/PREPAID-REQ-001"
      }
    },
    "agreement_id": "PREPAID-001",
    "amount_minor_units": 9900,
    "balance_before_minor_units": 10000,
    "column_id": "COL-BM",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.prepaid-agreement",
      "instance.payment"
    ],
    "expired_at": "2026-10-01T09:15:00Z",
    "fulfillmentStatus": "completed",
    "payment_request_id": "PAY-001",
    "reader_id": "READER-001",
    "request_id": "PREPAID-REQ-001",
    "started_at": "2026-10-01T09:02:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "accountId": "PREPAID-001",
    "debitId": "PREPAID-REQ-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.prepaid#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#expired_at",
      "name": "expired_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#payment_request_id",
      "name": "payment_request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#agreement_id",
      "name": "agreement_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#balance_before_minor_units",
      "name": "balance_before_minor_units",
      "origin": "server",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.read-debit-account-provider",
  "links": [
    {
      "capabilityRef": "capability.read-debit-result-account-provider",
      "kind": "navigation",
      "parameterBindings": {
        "accountId": {
          "kind": "path",
          "name": "accountId"
        },
        "debitId": {
          "kind": "path",
          "name": "debitId"
        }
      },
      "rel": "result"
    }
  ],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.debit",
  "uri": "/prepaid-accounts/{accountId}/debits/{debitId}",
  "view": "item"
}
```

### representation.read-debit-account-user

```json
{
  "actorRoleRefs": [
    "role.account-user"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "result": {
        "href": "/prepaid-accounts/PREPAID-001/debits/PREPAID-REQ-001/result"
      },
      "self": {
        "href": "/prepaid-accounts/PREPAID-001/debits/PREPAID-REQ-001"
      }
    },
    "agreement_id": "PREPAID-001",
    "amount_minor_units": 9900,
    "balance_before_minor_units": 10000,
    "column_id": "COL-BM",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.prepaid-agreement",
      "instance.payment"
    ],
    "expired_at": "2026-10-01T09:15:00Z",
    "fulfillmentStatus": "completed",
    "payment_request_id": "PAY-001",
    "reader_id": "READER-001",
    "request_id": "PREPAID-REQ-001",
    "started_at": "2026-10-01T09:02:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "accountId": "PREPAID-001",
    "debitId": "PREPAID-REQ-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.prepaid#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#expired_at",
      "name": "expired_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#payment_request_id",
      "name": "payment_request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#agreement_id",
      "name": "agreement_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#balance_before_minor_units",
      "name": "balance_before_minor_units",
      "origin": "server",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.read-debit-account-user",
  "links": [
    {
      "capabilityRef": "capability.read-debit-result-account-user",
      "kind": "navigation",
      "parameterBindings": {
        "accountId": {
          "kind": "path",
          "name": "accountId"
        },
        "debitId": {
          "kind": "path",
          "name": "debitId"
        }
      },
      "rel": "result"
    }
  ],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.debit",
  "uri": "/prepaid-accounts/{accountId}/debits/{debitId}",
  "view": "item"
}
```

### representation.read-debit-result-account-provider

```json
{
  "actorRoleRefs": [
    "role.account-provider"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/prepaid-accounts/PREPAID-001/debits/PREPAID-REQ-001/result"
      }
    },
    "amount_minor_units": 9900,
    "balance_after_minor_units": 100,
    "column_id": "COL-BM",
    "confirmed_at": "2026-10-01T09:05:00Z",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.prepaid-request",
      "instance.payment"
    ],
    "payment_id": "PREPAID-TX-001",
    "payment_request_id": "PAY-001",
    "reader_id": "READER-001",
    "request_id": "PREPAID-REQ-001",
    "subscription_id": "SUB-20261001-001",
    "success": true
  },
  "exampleParameters": {
    "accountId": "PREPAID-001",
    "debitId": "PREPAID-REQ-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.prepaid#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#payment_request_id",
      "name": "payment_request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#payment_id",
      "name": "payment_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#success",
      "name": "success",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#balance_after_minor_units",
      "name": "balance_after_minor_units",
      "origin": "derived",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.read-debit-result-account-provider",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.debit-result",
  "uri": "/prepaid-accounts/{accountId}/debits/{debitId}/result",
  "view": "singleton"
}
```

### representation.read-debit-result-account-user

```json
{
  "actorRoleRefs": [
    "role.account-user"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/prepaid-accounts/PREPAID-001/debits/PREPAID-REQ-001/result"
      }
    },
    "amount_minor_units": 9900,
    "balance_after_minor_units": 100,
    "column_id": "COL-BM",
    "confirmed_at": "2026-10-01T09:05:00Z",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.prepaid-request",
      "instance.payment"
    ],
    "payment_id": "PREPAID-TX-001",
    "payment_request_id": "PAY-001",
    "reader_id": "READER-001",
    "request_id": "PREPAID-REQ-001",
    "subscription_id": "SUB-20261001-001",
    "success": true
  },
  "exampleParameters": {
    "accountId": "PREPAID-001",
    "debitId": "PREPAID-REQ-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.prepaid#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#payment_request_id",
      "name": "payment_request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#payment_id",
      "name": "payment_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#success",
      "name": "success",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#balance_after_minor_units",
      "name": "balance_after_minor_units",
      "origin": "derived",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.read-debit-result-account-user",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.debit-result",
  "uri": "/prepaid-accounts/{accountId}/debits/{debitId}/result",
  "view": "singleton"
}
```

### representation.read-discontinuation-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/discontinuations/DISCONTINUATION-001"
      }
    },
    "column_id": "COL-BM",
    "created_at": "2026-10-16T10:00:00Z",
    "delisted": true,
    "evidenceRefs": [
      "instance.subscription"
    ],
    "missed_due_at": "2026-10-08T10:00:00Z",
    "missing_content": true,
    "reader_id": "READER-001",
    "rescheduled": false,
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "discontinuationId": "DISCONTINUATION-001"
  },
  "fields": [
    {
      "fmAttributeRef": "evidence.discontinuation#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#created_at",
      "name": "created_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#missed_due_at",
      "name": "missed_due_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#missing_content",
      "name": "missing_content",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#rescheduled",
      "name": "rescheduled",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#delisted",
      "name": "delisted",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.read-discontinuation-publisher",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.discontinuation",
  "uri": "/discontinuations/{discontinuationId}",
  "view": "item"
}
```

### representation.read-discontinuation-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/discontinuations/DISCONTINUATION-001"
      }
    },
    "column_id": "COL-BM",
    "created_at": "2026-10-16T10:00:00Z",
    "delisted": true,
    "evidenceRefs": [
      "instance.subscription"
    ],
    "missed_due_at": "2026-10-08T10:00:00Z",
    "missing_content": true,
    "reader_id": "READER-001",
    "rescheduled": false,
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "discontinuationId": "DISCONTINUATION-001"
  },
  "fields": [
    {
      "fmAttributeRef": "evidence.discontinuation#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#created_at",
      "name": "created_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#missed_due_at",
      "name": "missed_due_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#missing_content",
      "name": "missing_content",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#rescheduled",
      "name": "rescheduled",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#delisted",
      "name": "delisted",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.read-discontinuation-reader",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.discontinuation",
  "uri": "/discontinuations/{discontinuationId}",
  "view": "item"
}
```

### representation.read-payment-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/subscriptions/SUB-20261001-001/payment"
      }
    },
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.subscription"
    ],
    "expired_at": "2026-10-01T09:15:00Z",
    "fulfillmentStatus": "completed",
    "reader_id": "READER-001",
    "request_id": "PAY-001",
    "started_at": "2026-10-01T09:00:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.payment#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#started_at",
      "name": "started_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#expired_at",
      "name": "expired_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "derived",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "request.payment#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.read-payment-publisher",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.payment",
  "uri": "/subscriptions/{subscriptionId}/payment",
  "view": "singleton"
}
```

### representation.read-payment-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/subscriptions/SUB-20261001-001/payment"
      }
    },
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.subscription"
    ],
    "expired_at": "2026-10-01T09:15:00Z",
    "fulfillmentStatus": "completed",
    "reader_id": "READER-001",
    "request_id": "PAY-001",
    "started_at": "2026-10-01T09:00:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.payment#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#started_at",
      "name": "started_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#expired_at",
      "name": "expired_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "derived",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "request.payment#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.read-payment-reader",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.payment",
  "uri": "/subscriptions/{subscriptionId}/payment",
  "view": "singleton"
}
```

### representation.read-refund-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "result": {
        "href": "/subscriptions/SUB-20261001-001/refund/result"
      },
      "self": {
        "href": "/subscriptions/SUB-20261001-001/refund"
      }
    },
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.subscription",
      "instance.discontinuation",
      "instance.mobile-result"
    ],
    "expired_at": "2026-10-23T10:01:00Z",
    "fulfillmentStatus": "completed",
    "reader_id": "READER-001",
    "request_id": "REFUND-001",
    "started_at": "2026-10-16T10:01:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.refund#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#expired_at",
      "name": "expired_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "derived",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "request.refund#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.read-refund-publisher",
  "links": [
    {
      "capabilityRef": "capability.read-refund-result-publisher",
      "kind": "navigation",
      "parameterBindings": {
        "subscriptionId": {
          "kind": "path",
          "name": "subscriptionId"
        }
      },
      "rel": "result"
    }
  ],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.refund",
  "uri": "/subscriptions/{subscriptionId}/refund",
  "view": "singleton"
}
```

### representation.read-refund-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "result": {
        "href": "/subscriptions/SUB-20261001-001/refund/result"
      },
      "self": {
        "href": "/subscriptions/SUB-20261001-001/refund"
      }
    },
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.subscription",
      "instance.discontinuation",
      "instance.mobile-result"
    ],
    "expired_at": "2026-10-23T10:01:00Z",
    "fulfillmentStatus": "completed",
    "reader_id": "READER-001",
    "request_id": "REFUND-001",
    "started_at": "2026-10-16T10:01:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.refund#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#expired_at",
      "name": "expired_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "derived",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "request.refund#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.read-refund-reader",
  "links": [
    {
      "capabilityRef": "capability.read-refund-result-reader",
      "kind": "navigation",
      "parameterBindings": {
        "subscriptionId": {
          "kind": "path",
          "name": "subscriptionId"
        }
      },
      "rel": "result"
    }
  ],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.refund",
  "uri": "/subscriptions/{subscriptionId}/refund",
  "view": "singleton"
}
```

### representation.read-refund-result-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/subscriptions/SUB-20261001-001/refund/result"
      }
    },
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "confirmed_at": "2026-10-18T10:00:00Z",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.refund"
    ],
    "reader_id": "READER-001",
    "receipt_id": "REFUND-RECEIPT-001",
    "request_id": "REFUND-001",
    "settled": true,
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.refund#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#receipt_id",
      "name": "receipt_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#settled",
      "name": "settled",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.read-refund-result-publisher",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.refund-result",
  "uri": "/subscriptions/{subscriptionId}/refund/result",
  "view": "singleton"
}
```

### representation.read-refund-result-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/subscriptions/SUB-20261001-001/refund/result"
      }
    },
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "confirmed_at": "2026-10-18T10:00:00Z",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.refund"
    ],
    "reader_id": "READER-001",
    "receipt_id": "REFUND-RECEIPT-001",
    "request_id": "REFUND-001",
    "settled": true,
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.refund#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#receipt_id",
      "name": "receipt_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#settled",
      "name": "settled",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.read-refund-result-reader",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.refund-result",
  "uri": "/subscriptions/{subscriptionId}/refund/result",
  "view": "singleton"
}
```

### representation.read-relaunch-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/relaunches/RELAUNCH-001"
      }
    },
    "column_id": "COL-BM",
    "created_at": "2026-11-01T12:00:00Z",
    "edition_id": "ED-2",
    "evidenceRefs": [
      "instance.subscription"
    ],
    "listed": true,
    "reader_id": "READER-001",
    "relaunched_at": "2026-11-01T11:59:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "relaunchId": "RELAUNCH-001"
  },
  "fields": [
    {
      "fmAttributeRef": "evidence.relaunch#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#created_at",
      "name": "created_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#relaunched_at",
      "name": "relaunched_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#listed",
      "name": "listed",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.read-relaunch-publisher",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.relaunch",
  "uri": "/relaunches/{relaunchId}",
  "view": "item"
}
```

### representation.read-relaunch-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/relaunches/RELAUNCH-001"
      }
    },
    "column_id": "COL-BM",
    "created_at": "2026-11-01T12:00:00Z",
    "edition_id": "ED-2",
    "evidenceRefs": [
      "instance.subscription"
    ],
    "listed": true,
    "reader_id": "READER-001",
    "relaunched_at": "2026-11-01T11:59:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "relaunchId": "RELAUNCH-001"
  },
  "fields": [
    {
      "fmAttributeRef": "evidence.relaunch#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#created_at",
      "name": "created_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#relaunched_at",
      "name": "relaunched_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#listed",
      "name": "listed",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.read-relaunch-reader",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.relaunch",
  "uri": "/relaunches/{relaunchId}",
  "view": "item"
}
```

### representation.read-restore-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "result": {
        "href": "/subscriptions/SUB-20261001-001/restoration/result"
      },
      "self": {
        "href": "/subscriptions/SUB-20261001-001/restoration"
      }
    },
    "column_id": "COL-BM",
    "edition_id": "ED-2",
    "evidenceRefs": [
      "instance.subscription",
      "instance.relaunch",
      "instance.refunded"
    ],
    "expired_at": "2026-11-02T12:01:00Z",
    "fulfillmentStatus": "completed",
    "reader_id": "READER-001",
    "request_id": "RESTORE-001",
    "started_at": "2026-11-01T12:01:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.restore#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#expired_at",
      "name": "expired_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.read-restore-publisher",
  "links": [
    {
      "capabilityRef": "capability.read-restore-result-publisher",
      "kind": "navigation",
      "parameterBindings": {
        "subscriptionId": {
          "kind": "path",
          "name": "subscriptionId"
        }
      },
      "rel": "result"
    }
  ],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.restore",
  "uri": "/subscriptions/{subscriptionId}/restoration",
  "view": "singleton"
}
```

### representation.read-restore-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "result": {
        "href": "/subscriptions/SUB-20261001-001/restoration/result"
      },
      "self": {
        "href": "/subscriptions/SUB-20261001-001/restoration"
      }
    },
    "column_id": "COL-BM",
    "edition_id": "ED-2",
    "evidenceRefs": [
      "instance.subscription",
      "instance.relaunch",
      "instance.refunded"
    ],
    "expired_at": "2026-11-02T12:01:00Z",
    "fulfillmentStatus": "completed",
    "reader_id": "READER-001",
    "request_id": "RESTORE-001",
    "started_at": "2026-11-01T12:01:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.restore#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#expired_at",
      "name": "expired_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.read-restore-reader",
  "links": [
    {
      "capabilityRef": "capability.read-restore-result-reader",
      "kind": "navigation",
      "parameterBindings": {
        "subscriptionId": {
          "kind": "path",
          "name": "subscriptionId"
        }
      },
      "rel": "result"
    }
  ],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.restore",
  "uri": "/subscriptions/{subscriptionId}/restoration",
  "view": "singleton"
}
```

### representation.read-restore-result-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/subscriptions/SUB-20261001-001/restoration/result"
      }
    },
    "charged_minor_units": 0,
    "column_id": "COL-BM",
    "confirmed_at": "2026-11-01T12:02:00Z",
    "edition_id": "ED-2",
    "evidenceRefs": [
      "instance.restore"
    ],
    "reader_id": "READER-001",
    "request_id": "RESTORE-001",
    "restored": true,
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.restore#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#charged_minor_units",
      "name": "charged_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#restored",
      "name": "restored",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.read-restore-result-publisher",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.restore-result",
  "uri": "/subscriptions/{subscriptionId}/restoration/result",
  "view": "singleton"
}
```

### representation.read-restore-result-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/subscriptions/SUB-20261001-001/restoration/result"
      }
    },
    "charged_minor_units": 0,
    "column_id": "COL-BM",
    "confirmed_at": "2026-11-01T12:02:00Z",
    "edition_id": "ED-2",
    "evidenceRefs": [
      "instance.restore"
    ],
    "reader_id": "READER-001",
    "request_id": "RESTORE-001",
    "restored": true,
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.restore#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#charged_minor_units",
      "name": "charged_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#restored",
      "name": "restored",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.read-restore-result-reader",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.restore-result",
  "uri": "/subscriptions/{subscriptionId}/restoration/result",
  "view": "singleton"
}
```

### representation.read-subscription-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/subscriptions/SUB-20261001-001"
      }
    },
    "access_seconds": 60,
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "currency": "CNY",
    "edition_id": "ED-1",
    "payment_seconds": 900,
    "reader_id": "READER-001",
    "refund_seconds": 604800,
    "restore_seconds": 86400,
    "signed_at": "2026-10-01T09:00:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "contract.subscription#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#signed_at",
      "name": "signed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#payment_seconds",
      "name": "payment_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#access_seconds",
      "name": "access_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#refund_seconds",
      "name": "refund_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#restore_seconds",
      "name": "restore_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    }
  ],
  "id": "representation.read-subscription-publisher",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.subscription",
  "uri": "/subscriptions/{subscriptionId}",
  "view": "item"
}
```

### representation.read-subscription-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/subscriptions/SUB-20261001-001"
      }
    },
    "access_seconds": 60,
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "currency": "CNY",
    "edition_id": "ED-1",
    "payment_seconds": 900,
    "reader_id": "READER-001",
    "refund_seconds": 604800,
    "restore_seconds": 86400,
    "signed_at": "2026-10-01T09:00:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "contract.subscription#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#signed_at",
      "name": "signed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#payment_seconds",
      "name": "payment_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#access_seconds",
      "name": "access_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#refund_seconds",
      "name": "refund_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#restore_seconds",
      "name": "restore_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    }
  ],
  "id": "representation.read-subscription-reader",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.subscription",
  "uri": "/subscriptions/{subscriptionId}",
  "view": "item"
}
```

### representation.register-access-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "result": {
        "href": "/subscriptions/SUB-20261001-001/accesses/ACCESS-MOBILE/result"
      },
      "self": {
        "href": "/subscriptions/SUB-20261001-001/accesses/ACCESS-MOBILE"
      }
    },
    "chapter_id": "CH-01",
    "column_id": "COL-BM",
    "edition_id": "ED-1",
    "evidenceRefs": [
      "instance.subscription",
      "instance.mobile-result"
    ],
    "expired_at": "2026-10-01T09:07:00Z",
    "fulfillmentStatus": "pending",
    "reader_id": "READER-001",
    "request_id": "ACCESS-MOBILE",
    "started_at": "2026-10-01T09:06:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "accessId": "ACCESS-MOBILE",
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.access#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#expired_at",
      "name": "expired_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#chapter_id",
      "name": "chapter_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.access#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.register-access-reader",
  "links": [
    {
      "capabilityRef": "capability.read-access-result-reader",
      "kind": "navigation",
      "parameterBindings": {
        "accessId": {
          "kind": "path",
          "name": "accessId"
        },
        "subscriptionId": {
          "kind": "path",
          "name": "subscriptionId"
        }
      },
      "rel": "result"
    }
  ],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.access",
  "uri": "/subscriptions/{subscriptionId}/accesses/{accessId}",
  "view": "item"
}
```

### representation.register-access-result-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/subscriptions/SUB-20261001-001/accesses/ACCESS-MOBILE/result"
      }
    },
    "chapter_id": "CH-01",
    "column_id": "COL-BM",
    "confirmed_at": "2026-10-01T09:06:02Z",
    "delivered": true,
    "edition_id": "ED-1",
    "evidenceRefs": [
      "instance.access-mobile"
    ],
    "reader_id": "READER-001",
    "request_id": "ACCESS-MOBILE",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "accessId": "ACCESS-MOBILE",
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.access#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#chapter_id",
      "name": "chapter_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.access#delivered",
      "name": "delivered",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.register-access-result-publisher",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.access-result",
  "uri": "/subscriptions/{subscriptionId}/accesses/{accessId}/result",
  "view": "singleton"
}
```

### representation.register-account-account-user

```json
{
  "actorRoleRefs": [
    "role.account-user"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/prepaid-accounts/PREPAID-001"
      }
    },
    "agreement_id": "PREPAID-001",
    "reader_id": "READER-001",
    "signed_at": "2026-10-01T08:00:00Z"
  },
  "exampleParameters": {
    "accountId": "PREPAID-001"
  },
  "fields": [
    {
      "fmAttributeRef": "contract.prepaid#agreement_id",
      "name": "agreement_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.prepaid#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.prepaid#signed_at",
      "name": "signed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    }
  ],
  "id": "representation.register-account-account-user",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.account",
  "uri": "/prepaid-accounts/{accountId}",
  "view": "item"
}
```

### representation.register-debit-account-user

```json
{
  "actorRoleRefs": [
    "role.account-user"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "result": {
        "href": "/prepaid-accounts/PREPAID-001/debits/PREPAID-REQ-001/result"
      },
      "self": {
        "href": "/prepaid-accounts/PREPAID-001/debits/PREPAID-REQ-001"
      }
    },
    "agreement_id": "PREPAID-001",
    "amount_minor_units": 9900,
    "balance_before_minor_units": 10000,
    "column_id": "COL-BM",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.prepaid-agreement",
      "instance.payment"
    ],
    "expired_at": "2026-10-01T09:15:00Z",
    "fulfillmentStatus": "pending",
    "payment_request_id": "PAY-001",
    "reader_id": "READER-001",
    "request_id": "PREPAID-REQ-001",
    "started_at": "2026-10-01T09:02:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "accountId": "PREPAID-001",
    "debitId": "PREPAID-REQ-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.prepaid#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#expired_at",
      "name": "expired_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#payment_request_id",
      "name": "payment_request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#agreement_id",
      "name": "agreement_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.prepaid#balance_before_minor_units",
      "name": "balance_before_minor_units",
      "origin": "server",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.register-debit-account-user",
  "links": [
    {
      "capabilityRef": "capability.read-debit-result-account-user",
      "kind": "navigation",
      "parameterBindings": {
        "accountId": {
          "kind": "path",
          "name": "accountId"
        },
        "debitId": {
          "kind": "path",
          "name": "debitId"
        }
      },
      "rel": "result"
    }
  ],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.debit",
  "uri": "/prepaid-accounts/{accountId}/debits/{debitId}",
  "view": "item"
}
```

### representation.register-debit-result-account-provider

```json
{
  "actorRoleRefs": [
    "role.account-provider"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/prepaid-accounts/PREPAID-001/debits/PREPAID-REQ-001/result"
      }
    },
    "amount_minor_units": 9900,
    "balance_after_minor_units": 100,
    "column_id": "COL-BM",
    "confirmed_at": "2026-10-01T09:05:00Z",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.prepaid-request",
      "instance.payment"
    ],
    "payment_id": "PREPAID-TX-001",
    "payment_request_id": "PAY-001",
    "reader_id": "READER-001",
    "request_id": "PREPAID-REQ-001",
    "subscription_id": "SUB-20261001-001",
    "success": true
  },
  "exampleParameters": {
    "accountId": "PREPAID-001",
    "debitId": "PREPAID-REQ-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.prepaid#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#payment_request_id",
      "name": "payment_request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#payment_id",
      "name": "payment_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#success",
      "name": "success",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "fmAttributeRef": "confirmation.prepaid#balance_after_minor_units",
      "name": "balance_after_minor_units",
      "origin": "derived",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.register-debit-result-account-provider",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.debit-result",
  "uri": "/prepaid-accounts/{accountId}/debits/{debitId}/result",
  "view": "singleton"
}
```

### representation.register-discontinuation-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/discontinuations/DISCONTINUATION-001"
      }
    },
    "column_id": "COL-BM",
    "created_at": "2026-10-16T10:00:00Z",
    "delisted": true,
    "evidenceRefs": [
      "instance.subscription"
    ],
    "missed_due_at": "2026-10-08T10:00:00Z",
    "missing_content": true,
    "reader_id": "READER-001",
    "rescheduled": false,
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "discontinuationId": "DISCONTINUATION-001"
  },
  "fields": [
    {
      "fmAttributeRef": "evidence.discontinuation#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#created_at",
      "name": "created_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#missed_due_at",
      "name": "missed_due_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#missing_content",
      "name": "missing_content",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#rescheduled",
      "name": "rescheduled",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "fmAttributeRef": "evidence.discontinuation#delisted",
      "name": "delisted",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.register-discontinuation-publisher",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.discontinuation",
  "uri": "/discontinuations/{discontinuationId}",
  "view": "item"
}
```

### representation.register-payment-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/subscriptions/SUB-20261001-001/payment"
      }
    },
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.subscription"
    ],
    "expired_at": "2026-10-01T09:15:00Z",
    "fulfillmentStatus": "pending",
    "reader_id": "READER-001",
    "request_id": "PAY-001",
    "started_at": "2026-10-01T09:00:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.payment#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#started_at",
      "name": "started_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#expired_at",
      "name": "expired_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.payment#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "derived",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "request.payment#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.register-payment-publisher",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.payment",
  "uri": "/subscriptions/{subscriptionId}/payment",
  "view": "singleton"
}
```

### representation.register-refund-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "result": {
        "href": "/subscriptions/SUB-20261001-001/refund/result"
      },
      "self": {
        "href": "/subscriptions/SUB-20261001-001/refund"
      }
    },
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.subscription",
      "instance.discontinuation",
      "instance.mobile-result"
    ],
    "expired_at": "2026-10-23T10:01:00Z",
    "fulfillmentStatus": "pending",
    "reader_id": "READER-001",
    "request_id": "REFUND-001",
    "started_at": "2026-10-16T10:01:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.refund#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#expired_at",
      "name": "expired_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.refund#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "derived",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "request.refund#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.register-refund-reader",
  "links": [
    {
      "capabilityRef": "capability.read-refund-result-reader",
      "kind": "navigation",
      "parameterBindings": {
        "subscriptionId": {
          "kind": "path",
          "name": "subscriptionId"
        }
      },
      "rel": "result"
    }
  ],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.refund",
  "uri": "/subscriptions/{subscriptionId}/refund",
  "view": "singleton"
}
```

### representation.register-refund-result-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/subscriptions/SUB-20261001-001/refund/result"
      }
    },
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "confirmed_at": "2026-10-18T10:00:00Z",
    "currency": "CNY",
    "evidenceRefs": [
      "instance.refund"
    ],
    "reader_id": "READER-001",
    "receipt_id": "REFUND-RECEIPT-001",
    "request_id": "REFUND-001",
    "settled": true,
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.refund#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#receipt_id",
      "name": "receipt_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.refund#settled",
      "name": "settled",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.register-refund-result-publisher",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.refund-result",
  "uri": "/subscriptions/{subscriptionId}/refund/result",
  "view": "singleton"
}
```

### representation.register-relaunch-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/relaunches/RELAUNCH-001"
      }
    },
    "column_id": "COL-BM",
    "created_at": "2026-11-01T12:00:00Z",
    "edition_id": "ED-2",
    "evidenceRefs": [
      "instance.subscription"
    ],
    "listed": true,
    "reader_id": "READER-001",
    "relaunched_at": "2026-11-01T11:59:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "relaunchId": "RELAUNCH-001"
  },
  "fields": [
    {
      "fmAttributeRef": "evidence.relaunch#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#created_at",
      "name": "created_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#relaunched_at",
      "name": "relaunched_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "evidence.relaunch#listed",
      "name": "listed",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.register-relaunch-publisher",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.relaunch",
  "uri": "/relaunches/{relaunchId}",
  "view": "item"
}
```

### representation.register-restore-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "result": {
        "href": "/subscriptions/SUB-20261001-001/restoration/result"
      },
      "self": {
        "href": "/subscriptions/SUB-20261001-001/restoration"
      }
    },
    "column_id": "COL-BM",
    "edition_id": "ED-2",
    "evidenceRefs": [
      "instance.subscription",
      "instance.relaunch",
      "instance.refunded"
    ],
    "expired_at": "2026-11-02T12:01:00Z",
    "fulfillmentStatus": "pending",
    "reader_id": "READER-001",
    "request_id": "RESTORE-001",
    "started_at": "2026-11-01T12:01:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "request.restore#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#started_at",
      "name": "started_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#expired_at",
      "name": "expired_at",
      "origin": "derived",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "request.restore#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    },
    {
      "decision": "根据本请求当前可见证据及completion、breach规则计算；HTTP201只表示请求已登记。",
      "name": "fulfillmentStatus",
      "origin": "derived",
      "required": true,
      "schema": {
        "enum": [
          "pending",
          "completed",
          "breached"
        ],
        "type": "string"
      }
    }
  ],
  "id": "representation.register-restore-reader",
  "links": [
    {
      "capabilityRef": "capability.read-restore-result-reader",
      "kind": "navigation",
      "parameterBindings": {
        "subscriptionId": {
          "kind": "path",
          "name": "subscriptionId"
        }
      },
      "rel": "result"
    }
  ],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.restore",
  "uri": "/subscriptions/{subscriptionId}/restoration",
  "view": "singleton"
}
```

### representation.register-restore-result-publisher

```json
{
  "actorRoleRefs": [
    "role.publisher"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/subscriptions/SUB-20261001-001/restoration/result"
      }
    },
    "charged_minor_units": 0,
    "column_id": "COL-BM",
    "confirmed_at": "2026-11-01T12:02:00Z",
    "edition_id": "ED-2",
    "evidenceRefs": [
      "instance.restore"
    ],
    "reader_id": "READER-001",
    "request_id": "RESTORE-001",
    "restored": true,
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "confirmation.restore#request_id",
      "name": "request_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#confirmed_at",
      "name": "confirmed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#charged_minor_units",
      "name": "charged_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "confirmation.restore#restored",
      "name": "restored",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "boolean"
      }
    },
    {
      "decision": "既有凭证的定位引用；服务端核验实际玩家、本人实例及可见性，不接受未来或无关证明。",
      "name": "evidenceRefs",
      "origin": "reference",
      "required": true,
      "schema": {
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      }
    }
  ],
  "id": "representation.register-restore-result-publisher",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.restore-result",
  "uri": "/subscriptions/{subscriptionId}/restoration/result",
  "view": "singleton"
}
```

### representation.register-subscription-reader

```json
{
  "actorRoleRefs": [
    "role.reader"
  ],
  "availability": "not_evaluated",
  "cache": {
    "mode": "no-store",
    "reason": "单据和内容按本人资格提供，避免复用过时权益或跨读者泄露。"
  },
  "example": {
    "_links": {
      "self": {
        "href": "/subscriptions/SUB-20261001-001"
      }
    },
    "access_seconds": 60,
    "amount_minor_units": 9900,
    "column_id": "COL-BM",
    "currency": "CNY",
    "edition_id": "ED-1",
    "payment_seconds": 900,
    "reader_id": "READER-001",
    "refund_seconds": 604800,
    "restore_seconds": 86400,
    "signed_at": "2026-10-01T09:00:00Z",
    "subscription_id": "SUB-20261001-001"
  },
  "exampleParameters": {
    "subscriptionId": "SUB-20261001-001"
  },
  "fields": [
    {
      "fmAttributeRef": "contract.subscription#subscription_id",
      "name": "subscription_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#reader_id",
      "name": "reader_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#column_id",
      "name": "column_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#edition_id",
      "name": "edition_id",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#amount_minor_units",
      "name": "amount_minor_units",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#currency",
      "name": "currency",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#signed_at",
      "name": "signed_at",
      "origin": "reference",
      "required": true,
      "schema": {
        "format": "date-time",
        "type": "string"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#payment_seconds",
      "name": "payment_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#access_seconds",
      "name": "access_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#refund_seconds",
      "name": "refund_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    },
    {
      "fmAttributeRef": "contract.subscription#restore_seconds",
      "name": "restore_seconds",
      "origin": "reference",
      "required": true,
      "schema": {
        "type": "integer"
      }
    }
  ],
  "id": "representation.register-subscription-reader",
  "links": [],
  "mediaType": "application/hal+json",
  "resourceRef": "resource.subscription",
  "uri": "/subscriptions/{subscriptionId}",
  "view": "item"
}
```

## HTTP 消费流程

```json
[
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.register-subscription-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.register-subscription-reader",
        "expectStatus": 201,
        "id": "http.register-subscription-reader",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-subscription-reader",
        "expectStatus": 200,
        "id": "http.register-subscription-reader-read",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.read-subscription-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-subscription-reader",
        "expectStatus": 200,
        "id": "http.read-subscription-reader",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.read-subscription-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-subscription-publisher",
        "expectStatus": 200,
        "id": "http.read-subscription-publisher",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.account-user",
    "id": "http-journey.register-account-account-user",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.register-account-account-user",
        "expectStatus": 201,
        "id": "http.register-account-account-user",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-account-account-user",
        "expectStatus": 200,
        "id": "http.register-account-account-user-read",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.account-user",
    "id": "http-journey.read-account-account-user",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-account-account-user",
        "expectStatus": 200,
        "id": "http.read-account-account-user",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.account-provider",
    "id": "http-journey.read-account-account-provider",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-account-account-provider",
        "expectStatus": 200,
        "id": "http.read-account-account-provider",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.register-payment-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.register-payment-publisher",
        "expectStatus": 201,
        "id": "http.register-payment-publisher",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-payment-publisher",
        "expectStatus": 200,
        "id": "http.register-payment-publisher-read",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.read-payment-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-payment-reader",
        "expectStatus": 200,
        "id": "http.read-payment-reader",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.read-payment-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-payment-publisher",
        "expectStatus": 200,
        "id": "http.read-payment-publisher",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.register-access-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.register-access-reader",
        "expectStatus": 201,
        "id": "http.register-access-reader",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-access-reader",
        "expectStatus": 200,
        "id": "http.register-access-reader-read",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.read-access-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-access-reader",
        "expectStatus": 200,
        "id": "http.read-access-reader",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.read-access-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-access-publisher",
        "expectStatus": 200,
        "id": "http.read-access-publisher",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.register-refund-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.register-refund-reader",
        "expectStatus": 201,
        "id": "http.register-refund-reader",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-refund-reader",
        "expectStatus": 200,
        "id": "http.register-refund-reader-read",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.read-refund-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-refund-reader",
        "expectStatus": 200,
        "id": "http.read-refund-reader",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.read-refund-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-refund-publisher",
        "expectStatus": 200,
        "id": "http.read-refund-publisher",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.register-restore-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.register-restore-reader",
        "expectStatus": 201,
        "id": "http.register-restore-reader",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-restore-reader",
        "expectStatus": 200,
        "id": "http.register-restore-reader-read",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.read-restore-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-restore-reader",
        "expectStatus": 200,
        "id": "http.read-restore-reader",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.read-restore-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-restore-publisher",
        "expectStatus": 200,
        "id": "http.read-restore-publisher",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.account-user",
    "id": "http-journey.register-debit-account-user",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.register-debit-account-user",
        "expectStatus": 201,
        "id": "http.register-debit-account-user",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-debit-account-user",
        "expectStatus": 200,
        "id": "http.register-debit-account-user-read",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.account-user",
    "id": "http-journey.read-debit-account-user",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-debit-account-user",
        "expectStatus": 200,
        "id": "http.read-debit-account-user",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.account-provider",
    "id": "http-journey.read-debit-account-provider",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-debit-account-provider",
        "expectStatus": 200,
        "id": "http.read-debit-account-provider",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.register-access-result-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.register-access-result-publisher",
        "expectStatus": 201,
        "id": "http.register-access-result-publisher",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-access-result-publisher",
        "expectStatus": 200,
        "id": "http.register-access-result-publisher-read",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.read-access-result-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-access-result-reader",
        "expectStatus": 200,
        "id": "http.read-access-result-reader",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.read-access-result-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-access-result-publisher",
        "expectStatus": 200,
        "id": "http.read-access-result-publisher",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.register-refund-result-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.register-refund-result-publisher",
        "expectStatus": 201,
        "id": "http.register-refund-result-publisher",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-refund-result-publisher",
        "expectStatus": 200,
        "id": "http.register-refund-result-publisher-read",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.read-refund-result-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-refund-result-reader",
        "expectStatus": 200,
        "id": "http.read-refund-result-reader",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.read-refund-result-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-refund-result-publisher",
        "expectStatus": 200,
        "id": "http.read-refund-result-publisher",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.register-restore-result-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.register-restore-result-publisher",
        "expectStatus": 201,
        "id": "http.register-restore-result-publisher",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-restore-result-publisher",
        "expectStatus": 200,
        "id": "http.register-restore-result-publisher-read",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.read-restore-result-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-restore-result-reader",
        "expectStatus": 200,
        "id": "http.read-restore-result-reader",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.read-restore-result-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-restore-result-publisher",
        "expectStatus": 200,
        "id": "http.read-restore-result-publisher",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.account-provider",
    "id": "http-journey.register-debit-result-account-provider",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.register-debit-result-account-provider",
        "expectStatus": 201,
        "id": "http.register-debit-result-account-provider",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-debit-result-account-provider",
        "expectStatus": 200,
        "id": "http.register-debit-result-account-provider-read",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.account-user",
    "id": "http-journey.read-debit-result-account-user",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-debit-result-account-user",
        "expectStatus": 200,
        "id": "http.read-debit-result-account-user",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.account-provider",
    "id": "http-journey.read-debit-result-account-provider",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-debit-result-account-provider",
        "expectStatus": 200,
        "id": "http.read-debit-result-account-provider",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.register-discontinuation-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.register-discontinuation-publisher",
        "expectStatus": 201,
        "id": "http.register-discontinuation-publisher",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-discontinuation-publisher",
        "expectStatus": 200,
        "id": "http.register-discontinuation-publisher-read",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.read-discontinuation-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-discontinuation-reader",
        "expectStatus": 200,
        "id": "http.read-discontinuation-reader",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.read-discontinuation-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-discontinuation-publisher",
        "expectStatus": 200,
        "id": "http.read-discontinuation-publisher",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.register-relaunch-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.register-relaunch-publisher",
        "expectStatus": 201,
        "id": "http.register-relaunch-publisher",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-relaunch-publisher",
        "expectStatus": 200,
        "id": "http.register-relaunch-publisher-read",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.read-relaunch-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-relaunch-reader",
        "expectStatus": 200,
        "id": "http.read-relaunch-reader",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.read-relaunch-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-relaunch-publisher",
        "expectStatus": 200,
        "id": "http.read-relaunch-publisher",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.read-column-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-column-reader",
        "expectStatus": 200,
        "id": "http.read-column-reader",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.publisher",
    "id": "http-journey.read-column-publisher",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-column-publisher",
        "expectStatus": 200,
        "id": "http.read-column-publisher",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.read-chapter-reader",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-chapter-reader",
        "expectStatus": 200,
        "id": "http.read-chapter-reader",
        "status": "mapped"
      }
    ]
  },
  {
    "actorRoleRef": "role.reader",
    "id": "http-journey.reader-content",
    "status": "mapped",
    "steps": [
      {
        "capabilityRef": "capability.read-access-reader",
        "expectStatus": 200,
        "id": "http.content-request",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-access-result-reader",
        "expectStatus": 200,
        "id": "http.content-result",
        "status": "mapped"
      },
      {
        "capabilityRef": "capability.read-chapter-reader",
        "expectStatus": 200,
        "id": "http.content-body",
        "status": "mapped"
      }
    ]
  }
]
```
