import { isEqual, flatten } from 'lodash';
import { ObjectId } from 'mongodb';

export async function constructMissingIndexes(db, types, indexes) {
  const potentialIndexes = findPotentialIndexes(types);
  const missingIndexes = filterExistingIndexes(indexes, potentialIndexes);
  await createIndexes(db, missingIndexes);
}

function findPotentialIndexes(types) {
  return flatten(types.map(findIndexesInType));
}

function findIndexesInType(type) {
  const orderableFields = type.fields.filter((field) => field.orderable);
  return flatten(type.fields.map((field) => {
    if (field.name === 'id') {
      return [];
    } else if (field.unique) {
      return [
        {
          type: type.name,
          fields: [field.name, '_id'],
          unique: true,
        },
      ];
    } else if (field.orderable) {
      return [
        {
          type: type.name,
          fields: [field.name, '_id'],
        },
      ];
    } else if (field.type !== 'Connection' && field.reverseName) {
      const indexField = `${field.name}.value`;
      const baseIndexes = [
        {
          type: type.name,
          fields: [indexField, '_id'],
        },
      ];
      return baseIndexes.concat(
        orderableFields.map((orderableField) => ({
          type: type.name,
          fields: [indexField, orderableField.name, '_id'],
        })),
      );
    } else {
      return [];
    }
  }));
}

function filterExistingIndexes(indexes, potentialIndexes) {
  return potentialIndexes.filter((index) => !(
    (indexes[index.type] || []).some((existingIndex) =>
      isEqual(index.fields, existingIndex.fields)
    ))
  );
}

async function createIndexes(db, indexes) {
  await* indexes.map(async (index) => {
    index.name = new ObjectId().toString();
    const spec = index.fields.map((field) => [field, 1]);
    await db.collection(index.type).createIndex(spec, {
      name: index.name,
      unique: index.unique,
    });
    await db.collection('ReindexIndex').insert(index);
  });
}
