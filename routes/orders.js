import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import Order from '../models/Order.js';

// @route   GET /api/orders
// @desc    Get all orders
// @access  Private/Admin
const router = express.Router();
router.get('/', protect, admin, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    
    const orders = await Order.find({})
      .populate('user', 'id name email')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
      
    const total = await Order.countDocuments();
    
    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      totalOrders: total
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/orders/:id
// @desc    Get order by ID
// @access  Private/Admin
router.get('/:id', protect, admin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      'user',
      'name email'
    );
    
    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }
    
    res.json(order);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Order not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/orders/:id/deliver
// @desc    Update order to delivered
// @access  Private/Admin
router.put('/:id/deliver', protect, admin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }
    
    if (!order.isPaid) {
      return res.status(400).json({ msg: 'Order has not been paid yet' });
    }
    
    order.isDelivered = true;
    order.deliveredAt = Date.now();
    
    const updatedOrder = await order.save();
    
    res.json(updatedOrder);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/orders/:id
// @desc    Delete order
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }
    
    await order.remove();
    
    res.json({ msg: 'Order removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Order not found' });
    }
    res.status(500).send('Server Error');
  }
});

export default router;
