// Meesho deducts this per item on a customer return (RTO has no charge)
export const CUSTOMER_RETURN_CHARGE = 157;

export const RETURN_TYPES = ['Customer Return', 'RTO'];

export const defaultReturnCharge = (returnType) =>
  returnType === 'Customer Return' ? CUSTOMER_RETURN_CHARGE : 0;
