import express, { Router } from 'express';
import type { Request, Response } from 'express';


const app = express();


app.use((req, res, next) => {
    const id = Number(req.header("x-employee-id"));
    if (!id) return res.status(401).json({ error: "not logged in" });
    res.locals.employeeId = id;
    console.log(id);
    next();
})


app.get('/', (req: Request, res: Response) => {
    res.json({works: 'works'});
})


app.post('/attempts/:id/open', async (req, res) => {
    const attemptId = Number(req.params.id);
    const callerId = res.locals.employeeId;
    
    // 1 Load attempt from db
    // 2 404 if not found
    // 403 if attempt.employeeId aint the caller

    res.status(501).json({ todo: "open attempt", attemptId, callerId});
})


app.listen(3000, () => console.log('Server running at http://localhost:3000'));