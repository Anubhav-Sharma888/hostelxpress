from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class DemoLogin(StrictModel):
    name: str = Field(default='Anubhav',min_length=1,max_length=120)
    hostel_block: str = Field(default='C',min_length=1,max_length=80)


class ProfilePatch(StrictModel):
    name: str | None = Field(default=None,min_length=1,max_length=120)
    hostel_block: str | None = Field(default=None,min_length=1,max_length=80)


class Booking(StrictModel):
    destination_hostel_block: str = Field(min_length=1,max_length=80)
    parcel_label: str = Field(default='Parcel',min_length=1,max_length=120)


class DemoAdvance(StrictModel):
    action: Literal['load','dispatch','arrive','pay','close_lid']
