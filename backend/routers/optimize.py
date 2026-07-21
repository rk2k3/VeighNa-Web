"""Parameter optimization — search a saved strategy's params over a date split."""

from fastapi import APIRouter, HTTPException

from schemas import OptimizeReq, SensitivityReq
from services import optimize_service

router = APIRouter()


@router.post("/optimize")
def optimize(req: OptimizeReq):
    try:
        return optimize_service.run_optimization(
            kind=req.kind,
            strategy_id=req.strategy_id,
            start=req.start,
            end=req.end,
            split=req.split,
            n_trials=req.n_trials,
            target=req.target,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/optimize/sensitivity")
def sensitivity(req: SensitivityReq):
    try:
        return optimize_service.run_sensitivity(
            kind=req.kind,
            strategy_id=req.strategy_id,
            start=req.start,
            end=req.end,
            split=req.split,
            candidate=req.params,
            target=req.target,
            steps=req.steps,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
