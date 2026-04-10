import { jsonSchemaToZod } from '../src/json-schema-to-zod';

describe('jsonSchemaToZod', () => {
  it('should convert string type', () => {
    const schema = jsonSchemaToZod({ type: 'string' });
    expect(schema.safeParse('hello').success).toBe(true);
    expect(schema.safeParse(123).success).toBe(false);
  });

  it('should convert integer type to number', () => {
    const schema = jsonSchemaToZod({ type: 'integer' });
    expect(schema.safeParse(42).success).toBe(true);
    expect(schema.safeParse('hello').success).toBe(false);
  });

  it('should convert number type', () => {
    const schema = jsonSchemaToZod({ type: 'number' });
    expect(schema.safeParse(3.14).success).toBe(true);
  });

  it('should convert boolean type', () => {
    const schema = jsonSchemaToZod({ type: 'boolean' });
    expect(schema.safeParse(true).success).toBe(true);
    expect(schema.safeParse('true').success).toBe(false);
  });

  it('should convert array type without items', () => {
    const schema = jsonSchemaToZod({ type: 'array' });
    expect(schema.safeParse([1, 'two']).success).toBe(true);
  });

  it('should convert array type with items', () => {
    const schema = jsonSchemaToZod({ type: 'array', items: { type: 'string' } });
    expect(schema.safeParse(['a', 'b']).success).toBe(true);
    expect(schema.safeParse([1, 2]).success).toBe(false);
  });

  it('should convert object with properties recursively', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name'],
    });
    expect(schema.safeParse({ name: 'Alice', age: 30 }).success).toBe(true);
    expect(schema.safeParse({ name: 'Alice' }).success).toBe(true);
    expect(schema.safeParse({ age: 30 }).success).toBe(false);
  });

  it('should convert object without properties to record', () => {
    const schema = jsonSchemaToZod({ type: 'object' });
    expect(schema.safeParse({ foo: 'bar' }).success).toBe(true);
  });

  it('should handle string enum', () => {
    const schema = jsonSchemaToZod({ type: 'string', enum: ['active', 'inactive'] });
    expect(schema.safeParse('active').success).toBe(true);
    expect(schema.safeParse('other').success).toBe(false);
  });

  it('should handle number enum', () => {
    const schema = jsonSchemaToZod({ type: 'integer', enum: [1, 2, 3] });
    expect(schema.safeParse(1).success).toBe(true);
    expect(schema.safeParse(5).success).toBe(false);
  });

  it('should handle enum with null values', () => {
    const schema = jsonSchemaToZod({ type: 'string', enum: [null, 'active', 'inactive'] });
    expect(schema.safeParse('active').success).toBe(true);
    expect(schema.safeParse(null).success).toBe(false);
  });

  it('should handle nullable types', () => {
    const schema = jsonSchemaToZod({ type: 'string', nullable: true });
    expect(schema.safeParse('hello').success).toBe(true);
    expect(schema.safeParse(null).success).toBe(true);
    expect(schema.safeParse(123).success).toBe(false);
  });

  it('should handle allOf by merging properties', () => {
    const schema = jsonSchemaToZod({
      allOf: [
        { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        { type: 'object', properties: { age: { type: 'integer' } } },
      ],
    });
    expect(schema.safeParse({ name: 'Alice', age: 30 }).success).toBe(true);
    expect(schema.safeParse({ name: 'Alice' }).success).toBe(true);
    expect(schema.safeParse({ age: 30 }).success).toBe(false);
  });

  it('should handle allOf with parent properties', () => {
    const schema = jsonSchemaToZod({
      allOf: [
        { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      ],
      properties: { extra: { type: 'string' } },
    });
    expect(schema.safeParse({ id: 1, extra: 'x' }).success).toBe(true);
    expect(schema.safeParse({ id: 1 }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('should default unknown types to string', () => {
    const schema = jsonSchemaToZod({});
    expect(schema.safeParse('hello').success).toBe(true);
  });

  it('should handle nested objects', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            zip: { type: 'string' },
          },
          required: ['street'],
        },
      },
    });
    expect(schema.safeParse({ address: { street: '123 Main' } }).success).toBe(true);
    expect(schema.safeParse({ address: {} }).success).toBe(false);
  });
});
