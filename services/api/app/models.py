from __future__ import annotations

from typing import Literal
from uuid import UUID

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

class PickupOtpAttempt(BaseModel):
    # OTP2 entered on the rover; leading zeroes matter.
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=False)
    order_id: UUID
    compartment: int = Field(ge=1,le=3)
    code: str = Field(min_length=6,max_length=6,pattern=r'^[0-9]{6}\z')


class CourierCodeRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    order_id: UUID
    compartment: int = Field(ge=1,le=3)


class CourierCodeSubmission(BaseModel):
    # OTP1: from the courier, student forwards to display; not a verified code.
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=False)
    code: str = Field(min_length=4,max_length=8,pattern=r'^[0-9]{4,8}\z')
