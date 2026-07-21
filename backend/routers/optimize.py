"""Parameter optimization, walk-forward validation, and run history."""

from fastapi import APIRouter, HTTPException

from schemas import OptimizeReq, SensitivityReq, WalkForwardReq
from services import optimize_run_service, optimize_service

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
            seed=req.seed,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/optimize/walk_forward")
def walk_forward(req: WalkForwardReq):
    try:
        return optimize_service.run_walk_forward(
            kind=req.kind,
            strategy_id=req.strategy_id,
            start=req.start,
            end=req.end,
            n_windows=req.n_windows,
            train_windows=req.train_windows,
            n_trials=req.n_trials,
            target=req.target,
            seed=req.seed,
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


@router.get("/optimize/runs")
def list_runs():
    return optimize_run_service.list_runs()


@router.get("/optimize/runs/{run_id}")
def get_run(run_id: str):
    rec = optimize_run_service.get_run(run_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Run not found")
    return rec


@router.delete("/optimize/runs")
def clear_runs():
    return {"deleted": optimize_run_service.clear_runs()}


@router.delete("/optimize/runs/{run_id}")
def delete_run(run_id: str):
    if not optimize_run_service.delete_run(run_id):
        raise HTTPException(status_code=404, detail="Run not found")
    return {"status": "deleted"}
