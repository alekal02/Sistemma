import express from 'express';

const app = express();

app.get('/api/test/hello', (req, res) => {
  res.json({ message: 'hello works' });
});

app.get('/api/test/:id', (req, res) => {
  res.json({ id: req.params.id });
});

const router = express.Router();
router.get('/sub/:id', (req, res) => {
  res.json({ subId: req.params.id });
});
app.use('/api/test-router', router);

app.listen(3456, () => {
  console.log('Test server on 3456');
});
